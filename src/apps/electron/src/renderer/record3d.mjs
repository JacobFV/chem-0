import * as THREE from "three";
import { STLLoader } from "./vendor/STLLoader.js";

const JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"];
const CAPTURE_INTERVAL_MS = 100;

const viewerLeader = document.querySelector("#record-3d-leader");
const viewerFollower = document.querySelector("#record-3d-follower");
const startOverlay = document.querySelector("#start-overlay");
const startButton = document.querySelector("#start-button");
const startStatus = document.querySelector("#start-status");
const leaderSelect = document.querySelector("#leader-port");
const followerSelect = document.querySelector("#follower-port");
const taskSelect = document.querySelector("#task-select");
const targetEpisodes = document.querySelector("#target-episodes");
const experimentIdInput = document.querySelector("#experiment-id");
const recordOverlay = document.querySelector("#record-overlay");
const episodeCounter = document.querySelector("#episode-counter");
const frameCounter = document.querySelector("#frame-counter");
const taskLabel = document.querySelector("#task-label");
const recordStatus = document.querySelector("#record-status");
const recButton = document.querySelector("#rec-button");
const stopTeleopButton = document.querySelector("#stop-teleop-button");
const recordError = document.querySelector("#record-error");
const doneOverlay = document.querySelector("#done-overlay");
const doneSummary = document.querySelector("#done-summary");
const closeButton = document.querySelector("#close-button");
const camVideos = [
  document.querySelector("#rec-cam-0"),
  document.querySelector("#rec-cam-1"),
];

let urdfAsset = null;
let sceneLeader, sceneFollower;
let cameraLeader, cameraFollower;
let rendererLeader, rendererFollower;
let modelLeader, modelFollower;
let livePositions = { leader: {}, follower: {} };
let pollTimer = null;
let captureTimer = null;
let animationFrame = null;

let mode = "prepare";
let busy = false;
let teleopRunning = false;
let recording = false;
let currentEpisode = 0;
let targetCount = 5;
let taskName = "pick-and-pour";
let capturedFrames = [];
let capturedCameraFrames = [];

// Orbit controls for each view
const orbits = {
  leader: { target: new THREE.Vector3(0, 0, 0.16), radius: 3.25, theta: -0.84, phi: 1.12, dragging: false, lastX: 0, lastY: 0 },
  follower: { target: new THREE.Vector3(0, 0, 0.16), radius: 3.25, theta: -0.84, phi: 1.12, dragging: false, lastX: 0, lastY: 0 },
};

function textFromTool(result) {
  const content = result.content;
  if (!Array.isArray(content)) return JSON.stringify(result);
  return typeof content[0]?.text === "string" ? content[0].text : JSON.stringify(result);
}

function parseToolJson(result) {
  return JSON.parse(textFromTool(result));
}

function parseVector(raw) {
  const values = String(raw ?? "0 0 0").trim().split(/\s+/).map(Number);
  return new THREE.Vector3(values[0] || 0, values[1] || 0, values[2] || 0);
}

function parseRpy(raw) {
  const values = String(raw ?? "0 0 0").trim().split(/\s+/).map(Number);
  return new THREE.Euler(values[0] || 0, values[1] || 0, values[2] || 0, "XYZ");
}

function parseUrdf(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const materials = {};
  for (const material of xml.querySelectorAll("robot > material")) {
    const name = material.getAttribute("name") ?? "";
    const rgba = material.querySelector("color")?.getAttribute("rgba");
    if (!name || !rgba) continue;
    const v = rgba.split(/\s+/).map(Number);
    materials[name] = { color: new THREE.Color(v[0], v[1], v[2]), opacity: v[3] ?? 1 };
  }
  const links = {};
  for (const link of xml.querySelectorAll("link")) {
    const name = link.getAttribute("name") ?? "";
    links[name] = {
      name,
      visuals: Array.from(link.querySelectorAll(":scope > visual")).map((visual) => ({
        xyz: parseVector(visual.querySelector("origin")?.getAttribute("xyz")),
        rpy: parseRpy(visual.querySelector("origin")?.getAttribute("rpy")),
        mesh: visual.querySelector("mesh")?.getAttribute("filename") ?? "",
        material: visual.querySelector("material")?.getAttribute("name") ?? "3d_printed",
      })),
    };
  }
  const joints = Array.from(xml.querySelectorAll("joint")).map((joint) => ({
    name: joint.getAttribute("name") ?? "",
    type: joint.getAttribute("type") ?? "",
    parent: joint.querySelector("parent")?.getAttribute("link") ?? "",
    child: joint.querySelector("child")?.getAttribute("link") ?? "",
    xyz: parseVector(joint.querySelector("origin")?.getAttribute("xyz")),
    rpy: parseRpy(joint.querySelector("origin")?.getAttribute("rpy")),
    axis: parseVector(joint.querySelector("axis")?.getAttribute("xyz") ?? "0 0 1").normalize(),
  }));
  return { links, joints, materials };
}

function materialFor(name, materials, ghost = false) {
  const source = materials[name] ?? materials["3d_printed"];
  return new THREE.MeshStandardMaterial({
    color: source?.color ?? new THREE.Color(0xffd21f),
    roughness: 0.72,
    metalness: 0.05,
    transparent: ghost,
    opacity: ghost ? 0.22 : 1,
    depthWrite: !ghost,
  });
}

async function loadStl(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

async function buildRobotModel(urdf, { ghost = false } = {}) {
  const loader = new STLLoader();
  const root = new THREE.Group();
  root.scale.setScalar(5.0);
  root.rotation.x = -Math.PI / 2;
  root.rotation.z = Math.PI;

  const linkGroups = {};
  const jointMotion = {};
  for (const linkName of Object.keys(urdf.links)) {
    const group = new THREE.Group();
    group.name = linkName;
    linkGroups[linkName] = group;
  }

  const geometryCache = new Map();
  for (const link of Object.values(urdf.links)) {
    const group = linkGroups[link.name];
    for (const visual of link.visuals) {
      if (!visual.mesh.endsWith(".stl")) continue;
      const url = `./robot-assets/so101/${visual.mesh}`;
      let geometry = geometryCache.get(url);
      if (!geometry) {
        geometry = await loadStl(loader, url);
        geometry.computeVertexNormals();
        geometryCache.set(url, geometry);
      }
      const mesh = new THREE.Mesh(geometry, materialFor(visual.material, urdf.materials, ghost));
      mesh.position.copy(visual.xyz);
      mesh.rotation.copy(visual.rpy);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  const childLinks = new Set(urdf.joints.map((j) => j.child));
  const rootLink = Object.keys(urdf.links).find((name) => !childLinks.has(name)) ?? "base_link";
  root.add(linkGroups[rootLink]);

  for (const joint of urdf.joints) {
    const parent = linkGroups[joint.parent];
    const child = linkGroups[joint.child];
    if (!parent || !child) continue;
    const origin = new THREE.Group();
    origin.position.copy(joint.xyz);
    origin.rotation.copy(joint.rpy);
    const motion = new THREE.Group();
    origin.add(motion);
    motion.add(child);
    parent.add(origin);
    jointMotion[joint.name] = { motion, axis: joint.axis, type: joint.type };
  }

  root.userData.jointMotion = jointMotion;
  return root;
}

function rawAngle(positions, joint) {
  const raw = Number(positions[joint]);
  if (!Number.isFinite(raw)) return 0;
  return ((raw - 2047) / 4095) * Math.PI * 2;
}

function setRobotPose(robot, positions) {
  const motions = robot?.userData?.jointMotion ?? {};
  for (const [name, entry] of Object.entries(motions)) {
    entry.motion.quaternion.identity();
    if (entry.type !== "fixed") entry.motion.quaternion.setFromAxisAngle(entry.axis, rawAngle(positions, name));
  }
}

function createScene(container, orbit) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  camera.up.set(0, 0, 1);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.append(renderer.domElement);
  updateOrbitCamera(camera, orbit);
  installOrbitControls(renderer.domElement, orbit, () => updateOrbitCamera(camera, orbit));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(1.3, -1.4, 1.8);
  key.castShadow = true;
  scene.add(key);
  const grid = new THREE.GridHelper(1.0, 10, 0x303030, 0x151515);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
  return { scene, camera, renderer };
}

function updateOrbitCamera(camera, orbit) {
  const sinPhi = Math.sin(orbit.phi);
  camera.position.set(
    orbit.target.x + orbit.radius * sinPhi * Math.cos(orbit.theta),
    orbit.target.y + orbit.radius * sinPhi * Math.sin(orbit.theta),
    orbit.target.z + orbit.radius * Math.cos(orbit.phi)
  );
  camera.lookAt(orbit.target);
}

function installOrbitControls(element, state, update) {
  element.addEventListener("pointerdown", (event) => {
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.theta -= dx * 0.008;
    state.phi -= dy * 0.008;
    update();
  });
  element.addEventListener("pointerup", (event) => {
    state.dragging = false;
    element.releasePointerCapture(event.pointerId);
  });
  element.addEventListener("pointercancel", () => { state.dragging = false; });
}

function resizeView(renderer, camera, container) {
  const rect = container.getBoundingClientRect();
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function showOverlay(name) {
  startOverlay.hidden = name !== "start";
  recordOverlay.hidden = name !== "record";
  doneOverlay.hidden = name !== "done";
}

function showError(msg) {
  if (!msg) {
    recordError.textContent = "";
    recordError.hidden = true;
    return;
  }
  recordError.textContent = msg;
  recordError.hidden = false;
}

function labelView(container, text) {
  container.dataset.label = text;
}

function selectedPort(select) {
  return select.selectedOptions[0]?.value?.trim() ?? "";
}

function selectedRobotId(select) {
  const opt = select.selectedOptions[0];
  if (opt?.dataset.robotId) return opt.dataset.robotId;
  const port = selectedPort(select);
  const tail = port.split(/[^A-Za-z0-9]+/).filter(Boolean).pop() ?? "b";
  return `mcp_so101_${tail.toLowerCase()}`;
}

async function initScene() {
  const result = await fetch("./robot-assets/so101/so101_new_calib.urdf");
  const urdf = parseUrdf(await result.text());
  urdfAsset = urdf;

  viewerLeader.dataset.label = "leader";
  viewerFollower.dataset.label = "follower";

  const s1 = createScene(viewerLeader, orbits.leader);
  sceneLeader = s1.scene; cameraLeader = s1.camera; rendererLeader = s1.renderer;
  modelLeader = await buildRobotModel(urdf);
  sceneLeader.add(modelLeader);

  const s2 = createScene(viewerFollower, orbits.follower);
  sceneFollower = s2.scene; cameraFollower = s2.camera; rendererFollower = s2.renderer;
  modelFollower = await buildRobotModel(urdf, { ghost: false });
  sceneFollower.add(modelFollower);

  window.addEventListener("resize", () => {
    resizeView(rendererLeader, cameraLeader, viewerLeader);
    resizeView(rendererFollower, cameraFollower, viewerFollower);
  });
  resizeView(rendererLeader, cameraLeader, viewerLeader);
  resizeView(rendererFollower, cameraFollower, viewerFollower);
  animate();
}

function animate() {
  animationFrame = requestAnimationFrame(animate);
  setRobotPose(modelLeader, livePositions.leader);
  setRobotPose(modelFollower, livePositions.follower);
  if (rendererLeader && sceneLeader && cameraLeader) rendererLeader.render(sceneLeader, cameraLeader);
  if (rendererFollower && sceneFollower && cameraFollower) rendererFollower.render(sceneFollower, cameraFollower);
}

async function pollDuoPositions() {
  const lPort = selectedPort(leaderSelect);
  const fPort = selectedPort(followerSelect);
  const results = await Promise.allSettled([
    lPort ? window.chem0.callTool("read_so101_raw_positions", { port: lPort }) : Promise.resolve(null),
    fPort ? window.chem0.callTool("read_so101_raw_positions", { port: fPort }) : Promise.resolve(null),
  ]);
  for (const [key, result] of [["leader", results[0]], ["follower", results[1]]]) {
    if (result.status === "fulfilled" && result.value && !result.value.isError) {
      try {
        const parsed = parseToolJson(result.value);
        livePositions[key] = Object.fromEntries(
          Object.entries(parsed.positions ?? {}).map(([j, v]) => [j, Number(v)])
        );
      } catch {}
    }
  }
}

async function refreshArms() {
  leaderSelect.replaceChildren();
  followerSelect.replaceChildren();
  startStatus.textContent = "Scanning for arms…";
  startButton.disabled = true;
  try {
    const parsed = parseToolJson(await window.chem0.callTool("list_connected_robots", { max_id: 12 }));
    const robots = Array.isArray(parsed.robots) ? parsed.robots : [];
    for (const select of [leaderSelect, followerSelect]) {
      select.replaceChildren();
      for (const robot of robots) {
        const opt = document.createElement("option");
        const port = String(robot.port ?? "");
        opt.value = port;
        opt.textContent = `${port.replace(/^\/dev\/tty\./, "")} · IDs ${(robot.servo_ids ?? []).join(",")}`;
        if (typeof robot.suggested_robot_id === "string") opt.dataset.robotId = robot.suggested_robot_id;
        select.append(opt);
      }
      if (robots.length === 0) {
        select.append(Object.assign(document.createElement("option"), { textContent: "—", value: "" }));
      }
    }
    if (robots.length < 2) {
      startStatus.textContent = `Found ${robots.length} arm(s). Need 2 for teleop.`;
      startButton.disabled = true;
    } else {
      startStatus.textContent = `${robots.length} arms detected`;
      startButton.disabled = false;
    }
  } catch (error) {
    startStatus.textContent = error instanceof Error ? error.message : String(error);
    startButton.disabled = true;
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  void pollDuoPositions();
  pollTimer = setInterval(() => void pollDuoPositions(), 700);
}

function renderRecordUI() {
  taskLabel.textContent = taskName;
  episodeCounter.textContent = `Episode ${currentEpisode + 1} / ${targetCount}`;
  frameCounter.textContent = `${capturedFrames.length} frames`;
  if (recording) {
    recordStatus.textContent = "RECORDING";
    recButton.textContent = "STOP";
  } else {
    recordStatus.textContent = currentEpisode >= targetCount ? "done" : "ready";
    recButton.textContent = currentEpisode >= targetCount ? "—" : "START RECORD";
    recButton.disabled = currentEpisode >= targetCount;
  }
}

async function captureFrame() {
  const now = Date.now();
  const results = await Promise.allSettled([
    window.chem0.callTool("capture_record_frame", {}),
  ]);
  const frame = { timestamp: now, leader_pose: {}, follower_pose: {} };
  if (results[0].status === "fulfilled" && results[0].value && !results[0].value.isError) {
    try {
      const parsed = parseToolJson(results[0].value);
      frame.leader_pose = parsed.leader_pose ?? {};
      frame.follower_pose = parsed.follower_pose ?? {};
    } catch {}
  }
  // Fallback to polled positions if tool fails
  if (Object.keys(frame.leader_pose).length === 0) frame.leader_pose = { ...livePositions.leader };
  if (Object.keys(frame.follower_pose).length === 0) frame.follower_pose = { ...livePositions.follower };
  capturedFrames.push(frame);

  // Capture camera frames from browser video elements
  for (let i = 0; i < camVideos.length; i++) {
    const video = camVideos[i];
    if (!video || !video.srcObject || video.readyState < 2) continue;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 70));
      if (blob) {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j]);
        capturedCameraFrames.push({
          camera_id: i,
          data_base64: btoa(binary),
          mime_type: "image/jpeg",
          timestamp: now,
        });
      }
    } catch {}
  }

  frameCounter.textContent = `${capturedFrames.length} frames`;
}

async function startCaptureLoop() {
  if (captureTimer) clearInterval(captureTimer);
  await captureFrame();
  captureTimer = setInterval(() => void captureFrame(), CAPTURE_INTERVAL_MS);
}

function stopCaptureLoop() {
  if (captureTimer) {
    clearInterval(captureTimer);
    captureTimer = null;
  }
}

async function saveCurrentEpisode() {
  const experimentId = experimentIdInput.value.trim();
  if (!experimentId || capturedFrames.length === 0) return;
  try {
    const result = await window.chem0.callTool("save_episode", {
      experiment_id: experimentId,
      task: taskName,
      episode_index: currentEpisode,
      frames: capturedFrames,
      camera_frames: capturedCameraFrames,
    });
    return result;
  } catch (error) {
    showError(`Save failed: ${error.message || error}`);
    return null;
  }
}

async function handleStartTeleop() {
  if (busy) return;
  busy = true;
  startButton.disabled = true;
  startStatus.textContent = "Starting teleop…";
  try {
    const lPort = selectedPort(leaderSelect);
    const fPort = selectedPort(followerSelect);
    if (!lPort || !fPort) throw new Error("Select both leader and follower ports.");

    const expId = experimentIdInput.value.trim();
    if (!expId) throw new Error("Enter an experiment ID.");

    taskName = taskSelect.value;
    targetCount = parseInt(targetEpisodes.value, 10) || 5;

    const result = await window.chem0.callTool("start_teleop", {
      leader_port: lPort,
      follower_port: fPort,
    });
    if (result?.isError) {
      throw new Error(textFromTool(result));
    }

    teleopRunning = true;
    currentEpisode = 0;
    capturedFrames = [];
    capturedCameraFrames = [];
    mode = "record";
    showOverlay("record");
    renderRecordUI();
  } catch (error) {
    startStatus.textContent = error instanceof Error ? error.message : String(error);
    startButton.disabled = false;
  } finally {
    busy = false;
  }
}

async function handleRecordButton() {
  if (busy) return;
  if (!recording) {
    busy = true;
    try {
      recording = true;
      capturedFrames = [];
      capturedCameraFrames = [];
      recButton.disabled = true;
      await startCaptureLoop();
      renderRecordUI();
    } finally {
      recButton.disabled = false;
      busy = false;
    }
  } else {
    busy = true;
    try {
      recording = false;
      recButton.disabled = true;
      recButton.textContent = "SAVING…";
      stopCaptureLoop();
      await saveCurrentEpisode();
      currentEpisode += 1;
      recording = false;
      capturedFrames = [];
      capturedCameraFrames = [];
      renderRecordUI();
      if (currentEpisode >= targetCount) {
        recordStatus.textContent = "all episodes complete";
      }
    } finally {
      recButton.disabled = false;
      busy = false;
    }
  }
}

async function handleStopTeleop() {
  if (busy) return;
  busy = true;
  try {
    stopCaptureLoop();
    recording = false;
    await window.chem0.callTool("stop_teleop", {});
    teleopRunning = false;
    mode = "done";
    doneSummary.textContent = `${targetCount} episodes of ${taskName}`;
    showOverlay("done");
  } catch (error) {
    showError(error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
  }
}

async function initBrowserCameras() {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ video: true });
    for (const track of probe.getTracks()) track.stop();
    const devices = (await navigator.mediaDevices.enumerateDevices())
      .filter((d) => d.kind === "videoinput");
    for (let i = 0; i < camVideos.length; i++) {
      const video = camVideos[i];
      const device = devices[i];
      if (!video) continue;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: device ? { deviceId: { exact: device.deviceId }, width: { ideal: 640 }, height: { ideal: 480 } } : true,
        });
        video.srcObject = stream;
      } catch {}
    }
  } catch {}
}

leaderSelect.addEventListener("change", () => {
  if (selectedPort(leaderSelect) && selectedPort(followerSelect)) startPolling();
});
followerSelect.addEventListener("change", () => {
  if (selectedPort(leaderSelect) && selectedPort(followerSelect)) startPolling();
});
startButton.addEventListener("click", () => void handleStartTeleop());
recButton.addEventListener("click", () => void handleRecordButton());
stopTeleopButton.addEventListener("click", () => void handleStopTeleop());
closeButton.addEventListener("click", () => window.close());

window.addEventListener("beforeunload", () => {
  if (teleopRunning) window.chem0.callTool("stop_teleop", {}).catch(() => {});
  if (pollTimer) clearInterval(pollTimer);
  if (captureTimer) clearInterval(captureTimer);
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (rendererLeader) rendererLeader.dispose();
  if (rendererFollower) rendererFollower.dispose();
});

showOverlay("start");
void initScene().catch((error) => {
  const msg = error instanceof Error ? error.stack || error.message : String(error);
  startStatus.textContent = `3D failed: ${msg}`;
});
void refreshArms();
void initBrowserCameras();
