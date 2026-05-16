import * as THREE from "three";
import { STLLoader } from "./vendor/STLLoader.js";

const FALLBACK_STEPS = [
  { axis: "Z1", joint: "shoulder_pan", label: "base Z roll", first: "all the way to the left", second: "all the way to the right" },
  { axis: "X1", joint: "shoulder_lift", label: "base X pitch", first: "all the way backward", second: "all the way forward" },
  { axis: "X2", joint: "elbow_flex", label: "elbow X pitch", first: "fully bent/backward", second: "fully extended/forward" },
  { axis: "X3", joint: "wrist_flex", label: "wrist X pitch", first: "all the way down/backward", second: "all the way up/forward" },
  { axis: "Z2", joint: "wrist_roll", label: "wrist Z roll", first: "all the way counterclockwise/left", second: "all the way clockwise/right" },
  { axis: "Hand", joint: "gripper", label: "gripper", first: "fully closed", second: "fully open" }
];

const portInput = document.querySelector("#calibration-port");
const robotSelect = document.querySelector("#calibration-robot");
const robotIdInput = document.querySelector("#calibration-robot-id");
const refreshRobotsButton = document.querySelector("#refresh-robots");
const prepareButton = document.querySelector("#prepare-calibration");
const recordButton = document.querySelector("#record-endpoint");
const finishButton = document.querySelector("#finish-calibration");
const stepCount = document.querySelector("#step-count");
const stepTitle = document.querySelector("#step-title");
const stepPrompt = document.querySelector("#step-prompt");
const endpointTable = document.querySelector("#endpoint-table");
const output = document.querySelector("#calibration-output");
const viewer = document.querySelector("#urdf-viewer");
const caption = document.querySelector("#urdf-caption");

let steps = FALLBACK_STEPS;
let stepIndex = 0;
let endpointIndex = 0;
let records = {};
let livePositions = {};
let pollTimer = undefined;
let animationFrame = undefined;

let scene;
let camera;
let renderer;
let liveRobot;
let guideRobot;
let urdfJoints = [];

function failLoudly(error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  viewer.replaceChildren();
  const box = document.createElement("pre");
  box.className = "calibration-fatal";
  box.textContent = `3D calibration viewer failed.\n\n${message}`;
  viewer.append(box);
  caption.textContent = "3D viewer failed; no 2D fallback is available.";
  show({ fatal_3d_viewer_error: message });
  throw error;
}

function show(value) {
  output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

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
        material: visual.querySelector("material")?.getAttribute("name") ?? "3d_printed"
      }))
    };
  }

  const joints = Array.from(xml.querySelectorAll("joint")).map((joint) => ({
    name: joint.getAttribute("name") ?? "",
    type: joint.getAttribute("type") ?? "",
    parent: joint.querySelector("parent")?.getAttribute("link") ?? "",
    child: joint.querySelector("child")?.getAttribute("link") ?? "",
    xyz: parseVector(joint.querySelector("origin")?.getAttribute("xyz")),
    rpy: parseRpy(joint.querySelector("origin")?.getAttribute("rpy")),
    axis: parseVector(joint.querySelector("axis")?.getAttribute("xyz") ?? "0 0 1").normalize()
  }));
  return { links, joints, materials };
}

function currentStep() {
  return steps[stepIndex];
}

function currentDirection(step) {
  return endpointIndex === 0 ? step.first : step.second;
}

function rawAngle(joint) {
  const raw = Number(livePositions[joint]);
  if (!Number.isFinite(raw)) return 0;
  return ((raw - 2047) / 4095) * Math.PI * 2;
}

function guideAngle(joint) {
  const step = currentStep();
  if (!step || step.joint !== joint) return rawAngle(joint);
  const sign = endpointIndex === 0 ? -1 : 1;
  if (joint === "gripper") return sign > 0 ? 1.2 : -0.15;
  return sign * 1.25;
}

function materialFor(name, materials, ghost = false) {
  if (ghost) {
    return new THREE.MeshStandardMaterial({
      color: 0xd8a64f,
      roughness: 0.65,
      metalness: 0.05,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
  }
  const source = materials[name] ?? materials["3d_printed"];
  return new THREE.MeshStandardMaterial({
    color: source?.color ?? new THREE.Color(0xffd21f),
    roughness: 0.72,
    metalness: 0.05
  });
}

async function loadStl(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

async function buildRobotModel(urdf, { ghost = false } = {}) {
  const loader = new STLLoader();
  const root = new THREE.Group();
  root.name = ghost ? "guide_so101" : "live_so101";
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

  const childLinks = new Set(urdf.joints.map((joint) => joint.child));
  const rootLink = Object.keys(urdf.links).find((name) => !childLinks.has(name)) ?? "base_link";
  root.add(linkGroups[rootLink]);

  for (const joint of urdf.joints) {
    const parent = linkGroups[joint.parent];
    const child = linkGroups[joint.child];
    if (!parent || !child) continue;
    const origin = new THREE.Group();
    origin.name = `${joint.name}_origin`;
    origin.position.copy(joint.xyz);
    origin.rotation.copy(joint.rpy);
    const motion = new THREE.Group();
    motion.name = `${joint.name}_motion`;
    origin.add(motion);
    motion.add(child);
    parent.add(origin);
    jointMotion[joint.name] = { motion, axis: joint.axis, type: joint.type };
  }

  root.userData.jointMotion = jointMotion;
  return root;
}

function setRobotPose(robot, angleFor) {
  const joints = robot?.userData?.jointMotion ?? {};
  for (const [name, entry] of Object.entries(joints)) {
    entry.motion.quaternion.identity();
    if (entry.type !== "fixed") entry.motion.quaternion.setFromAxisAngle(entry.axis, angleFor(name));
  }
}

async function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
  camera.position.set(1.8, -2.0, 1.44);
  camera.lookAt(0, 0, 0.16);
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  viewer.replaceChildren(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(1.3, -1.4, 1.8);
  key.castShadow = true;
  scene.add(key);
  const grid = new THREE.GridHelper(1.0, 10, 0x303030, 0x151515);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  window.addEventListener("resize", resizeScene);
  resizeScene();
  animate();
}

function resizeScene() {
  if (!renderer || !camera) return;
  const rect = viewer.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  animationFrame = requestAnimationFrame(animate);
  if (liveRobot) setRobotPose(liveRobot, rawAngle);
  if (guideRobot) setRobotPose(guideRobot, guideAngle);
  if (renderer && scene && camera) renderer.render(scene, camera);
}

async function loadRobotModel() {
  await initScene();
  const result = await fetch("./robot-assets/so101/so101_new_calib.urdf");
  const urdf = parseUrdf(await result.text());
  urdfJoints = urdf.joints;
  guideRobot = await buildRobotModel(urdf, { ghost: true });
  liveRobot = await buildRobotModel(urdf, { ghost: false });
  scene.add(guideRobot);
  scene.add(liveRobot);
  renderStep();
}

function renderTable() {
  endpointTable.replaceChildren();
  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Axis</th><th>Joint</th><th>First</th><th>Second</th></tr></thead>";
  const body = document.createElement("tbody");
  for (const step of steps) {
    const rec = records[step.joint] ?? {};
    const row = document.createElement("tr");
    row.innerHTML = `<td>${step.axis}</td><td>${step.joint}</td><td>${rec.first ?? ""}</td><td>${rec.second ?? ""}</td>`;
    if (step === currentStep()) row.classList.add("active");
    body.append(row);
  }
  table.append(body);
  endpointTable.append(table);
}

function renderStep() {
  const step = currentStep();
  if (!step) {
    stepCount.textContent = "Ready to finish";
    stepTitle.textContent = "All endpoints recorded";
    stepPrompt.textContent = "Click Finish to write the calibration file and servo register limits.";
    recordButton.disabled = true;
    finishButton.disabled = false;
    caption.textContent = `3D SO-101 mesh loaded · ${urdfJoints.length} URDF joints · ready to save`;
    renderTable();
    return;
  }

  const endpointName = endpointIndex === 0 ? "first" : "second";
  stepCount.textContent = `${stepIndex + 1} / ${steps.length} · ${endpointName} endpoint`;
  stepTitle.textContent = `${step.axis} · ${step.label}`;
  stepPrompt.textContent = `Move ${step.label} ${currentDirection(step)}, matching the amber ghost arm, then click Record.`;
  recordButton.disabled = false;
  finishButton.disabled = true;
  caption.textContent = `3D SO-101 mesh · teal is live hardware pose · amber is ${step.axis} ${currentDirection(step)}`;
  renderTable();
}

function advance() {
  if (endpointIndex === 0) {
    endpointIndex = 1;
    renderStep();
    return;
  }
  endpointIndex = 0;
  stepIndex += 1;
  renderStep();
}

async function refreshRobots() {
  robotSelect.replaceChildren();
  const loading = document.createElement("option");
  loading.textContent = "Scanning...";
  robotSelect.append(loading);
  try {
    const parsed = parseToolJson(await window.chem0.callTool("list_connected_robots", { max_id: 12 }));
    const robots = Array.isArray(parsed.robots) ? parsed.robots : [];
    robotSelect.replaceChildren();
    for (const robot of robots) {
      const option = document.createElement("option");
      const port = String(robot.port ?? "");
      const ids = Array.isArray(robot.servo_ids) ? robot.servo_ids.join(",") : "";
      option.value = port;
      option.textContent = `${port} · IDs ${ids || "none"}`;
      if (typeof robot.suggested_robot_id === "string") option.dataset.robotId = robot.suggested_robot_id;
      robotSelect.append(option);
    }
    if (robots.length === 0) {
      const option = document.createElement("option");
      option.value = portInput.value;
      option.textContent = "No robots detected";
      robotSelect.append(option);
    }
    const selected = robotSelect.selectedOptions[0];
    if (selected?.value) portInput.value = selected.value;
    if (selected?.dataset.robotId) robotIdInput.value = selected.dataset.robotId;
    startLivePolling();
    show(parsed);
  } catch (error) {
    robotSelect.replaceChildren();
    const option = document.createElement("option");
    option.value = portInput.value;
    option.textContent = "Scan failed";
    robotSelect.append(option);
    show(error instanceof Error ? error.message : String(error));
  }
}

async function pollLivePositions() {
  const port = portInput.value.trim();
  if (!port) return;
  try {
    const parsed = parseToolJson(await window.chem0.callTool("read_so101_raw_positions", { port }));
    livePositions = Object.fromEntries(Object.entries(parsed.positions ?? {}).map(([joint, value]) => [joint, Number(value)]));
  } catch {
    // The explicit calibration actions surface actionable errors.
  }
}

function startLivePolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  void pollLivePositions();
  pollTimer = window.setInterval(() => void pollLivePositions(), 700);
}

robotSelect.addEventListener("change", () => {
  const selected = robotSelect.selectedOptions[0];
  if (selected?.value) portInput.value = selected.value;
  if (selected?.dataset.robotId) robotIdInput.value = selected.dataset.robotId;
  startLivePolling();
});

refreshRobotsButton.addEventListener("click", () => void refreshRobots());

prepareButton.addEventListener("click", async () => {
  const port = portInput.value.trim();
  if (!port) {
    show("Select a connected robot or enter a serial port first.");
    return;
  }
  prepareButton.disabled = true;
  try {
    const result = await window.chem0.callTool("prepare_so101_calibration", { port });
    const parsed = parseToolJson(result);
    if (Array.isArray(parsed.steps)) steps = parsed.steps;
    stepIndex = 0;
    endpointIndex = 0;
    records = {};
    show(parsed);
    startLivePolling();
    renderStep();
  } catch (error) {
    prepareButton.disabled = false;
    show(error instanceof Error ? error.message : String(error));
  }
});

recordButton.addEventListener("click", async () => {
  const step = currentStep();
  if (!step) return;
  recordButton.disabled = true;
  try {
    const result = await window.chem0.callTool("read_so101_calibration_endpoint", {
      port: portInput.value.trim(),
      joint: step.joint,
      samples: 5
    });
    const parsed = parseToolJson(result);
    const raw = Number(parsed.raw_position);
    if (!Number.isFinite(raw)) throw new Error("Endpoint read did not return a raw_position.");
    const rec = records[step.joint] ?? {};
    if (endpointIndex === 0) rec.first = raw;
    else rec.second = raw;
    records[step.joint] = rec;
    show(parsed);
    advance();
  } catch (error) {
    show(error instanceof Error ? error.message : String(error));
    recordButton.disabled = false;
  }
});

finishButton.addEventListener("click", async () => {
  finishButton.disabled = true;
  try {
    const result = await window.chem0.callTool("finalize_so101_calibration", {
      port: portInput.value.trim(),
      robot_id: robotIdInput.value.trim(),
      records,
      write_motors: true
    });
    show(parseToolJson(result));
    stepCount.textContent = "Calibration saved";
    stepTitle.textContent = robotIdInput.value.trim();
    stepPrompt.textContent = "Use this robot id when connecting the arm.";
  } catch (error) {
    finishButton.disabled = false;
    show(error instanceof Error ? error.message : String(error));
  }
});

window.addEventListener("beforeunload", () => {
  if (pollTimer) window.clearInterval(pollTimer);
  if (animationFrame) cancelAnimationFrame(animationFrame);
  renderer?.dispose();
});

renderStep();
void loadRobotModel().catch(failLoudly);
void refreshRobots();
