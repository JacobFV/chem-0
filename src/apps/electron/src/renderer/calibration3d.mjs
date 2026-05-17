import * as THREE from "three";
import { STLLoader } from "./vendor/STLLoader.js";

const FALLBACK_STEPS = [
  { axis: "Z1", joint: "shoulder_pan", label: "base", first: "left", second: "right" },
  { axis: "X1", joint: "shoulder_lift", label: "shoulder", first: "back", second: "forward" },
  { axis: "X2", joint: "elbow_flex", label: "elbow", first: "bent", second: "extended" },
  { axis: "X3", joint: "wrist_flex", label: "wrist", first: "down", second: "up" },
  { axis: "Z2", joint: "wrist_roll", label: "wrist roll", first: "ccw", second: "cw" },
  { axis: "Hand", joint: "gripper", label: "gripper", first: "closed", second: "open" }
];

const DIRECTION_CUES = {
  shoulder_pan: {
    first: { glyph: "←", verb: "Rotate base fully left" },
    second: { glyph: "→", verb: "Rotate base fully right" }
  },
  shoulder_lift: {
    first: { glyph: "⤴", verb: "Tilt shoulder all the way back" },
    second: { glyph: "⤵", verb: "Tilt shoulder all the way forward" }
  },
  elbow_flex: {
    first: { glyph: "↶", verb: "Bend elbow fully back" },
    second: { glyph: "↷", verb: "Extend elbow fully forward" }
  },
  wrist_flex: {
    first: { glyph: "↓", verb: "Wrist all the way down" },
    second: { glyph: "↑", verb: "Wrist all the way up" }
  },
  wrist_roll: {
    first: { glyph: "↺", verb: "Roll wrist counterclockwise" },
    second: { glyph: "↻", verb: "Roll wrist clockwise" }
  },
  gripper: {
    first: { glyph: "▶◀", verb: "Close gripper fully" },
    second: { glyph: "◀ ▶", verb: "Open gripper fully" }
  }
};

const ALIGN_TOLERANCE_RAD = 0.12;

// Reference second-endpoint raw positions (0..4095, servo center 2047) derived from a
// real SO-101 calibration on this hardware. These are *targets* the ghost points toward
// during the second endpoint of each joint, not enforced limits.
const GUIDE_SECOND_TARGETS = {
  shoulder_pan: 1134,
  shoulder_lift: 2366,
  elbow_flex: 1221,
  wrist_flex: 3093,
  wrist_roll: 2170,
  gripper: 557
};

const robotSelect = document.querySelector("#calibration-robot");
const startOverlay = document.querySelector("#start-overlay");
const startButton = document.querySelector("#start-button");
const startStatus = document.querySelector("#start-status");
const confirmOverlay = document.querySelector("#confirm-overlay");
const confirmStartButton = document.querySelector("#confirm-start");
const confirmCancelButton = document.querySelector("#confirm-cancel");
const stepOverlay = document.querySelector("#step-overlay");
const cueArrow = document.querySelector("#cue-arrow");
const cueVerb = document.querySelector("#cue-verb");
const stepStatus = document.querySelector("#step-status");
const stepError = document.querySelector("#step-error");
const stepButton = document.querySelector("#step-button");
const progressDots = document.querySelector("#progress-dots");
const doneOverlay = document.querySelector("#done-overlay");
const doneId = document.querySelector("#done-id");
const closeButton = document.querySelector("#close-button");
const viewer = document.querySelector("#urdf-viewer");

let steps = FALLBACK_STEPS;
let stepIndex = 0;
let endpointIndex = 0;
let records = {};
let livePositions = {};
let pollTimer = undefined;
let animationFrame = undefined;
// "prepare" | "record" | "finish" | "done"
let mode = "prepare";
let busy = false;
let pollPaused = false;

let scene;
let camera;
let renderer;
let liveRobot;
let guideRobot;
const orbit = {
  target: new THREE.Vector3(0, 0, 0.16),
  radius: 3.25,
  theta: -0.84,
  phi: 1.12,
  dragging: false,
  lastX: 0,
  lastY: 0
};

function failLoudly(error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  viewer.replaceChildren();
  const box = document.createElement("pre");
  box.className = "calibration-fatal";
  box.textContent = `3D calibration viewer failed.\n\n${message}`;
  viewer.append(box);
  startStatus.textContent = "3D viewer failed to load.";
  throw error;
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

function currentStep() { return steps[stepIndex]; }
function currentEndpointKey() { return endpointIndex === 0 ? "first" : "second"; }

function selectedPort() {
  return robotSelect.selectedOptions[0]?.value?.trim() ?? "";
}

function selectedRobotId() {
  const opt = robotSelect.selectedOptions[0];
  const suggested = opt?.dataset.robotId;
  if (suggested) return suggested;
  const port = selectedPort();
  const tail = port.split(/[^A-Za-z0-9]+/).filter(Boolean).pop() ?? "b";
  return `mcp_so101_${tail.toLowerCase()}`;
}

function rawAngle(joint) {
  const raw = Number(livePositions[joint]);
  if (!Number.isFinite(raw)) return 0;
  return ((raw - 2047) / 4095) * Math.PI * 2;
}

function guideAngle(joint) {
  const step = currentStep();
  if (!step || step.joint !== joint || mode !== "record") return rawAngle(joint);
  // First endpoint: no reference — keep the ghost on top of the live pose so it's invisible.
  if (endpointIndex === 0) return rawAngle(joint);
  // Second endpoint: aim the ghost at the empirically measured second-endpoint raw position
  // for this joint. This is a directional hint, not a position the operator must match.
  const targetRaw = GUIDE_SECOND_TARGETS[joint];
  if (!Number.isFinite(targetRaw)) return rawAngle(joint);
  return ((targetRaw - 2047) / 4095) * Math.PI * 2;
}

function materialFor(name, materials, ghost = false) {
  if (ghost) {
    return new THREE.MeshStandardMaterial({
      color: 0xd8a64f, roughness: 0.65, metalness: 0.05,
      transparent: true, opacity: 0.22, depthWrite: false
    });
  }
  const source = materials[name] ?? materials["3d_printed"];
  return new THREE.MeshStandardMaterial({
    color: source?.color ?? new THREE.Color(0xffd21f),
    roughness: 0.72, metalness: 0.05
  });
}

async function loadStl(loader, url) {
  return new Promise((resolve, reject) => { loader.load(url, resolve, undefined, reject); });
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
  updateOrbitCamera();
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  viewer.replaceChildren(renderer.domElement);
  installOrbitControls(renderer.domElement, orbit, updateOrbitCamera);

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

function updateOrbitCamera() {
  if (!camera) return;
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
    state.phi = Math.max(0.18, Math.min(Math.PI - 0.18, state.phi + dy * 0.008));
    update();
  });
  element.addEventListener("pointerup", (event) => {
    state.dragging = false;
    element.releasePointerCapture(event.pointerId);
  });
  element.addEventListener("pointercancel", () => { state.dragging = false; });
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
  if (guideRobot) {
    setRobotPose(guideRobot, guideAngle);
    guideRobot.visible = mode === "record" && endpointIndex === 1;
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
  updateAlignment();
}

async function loadRobotModel() {
  await initScene();
  const result = await fetch("./robot-assets/so101/so101_new_calib.urdf");
  const urdf = parseUrdf(await result.text());
  guideRobot = await buildRobotModel(urdf, { ghost: true });
  liveRobot = await buildRobotModel(urdf, { ghost: false });
  scene.add(guideRobot);
  scene.add(liveRobot);
}

function renderProgress() {
  progressDots.replaceChildren();
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const rec = records[step.joint] ?? {};
    for (const key of ["first", "second"]) {
      const dot = document.createElement("span");
      dot.className = "progress-dot";
      if (rec[key] !== undefined) dot.classList.add("filled");
      if (i === stepIndex && mode === "record" && key === currentEndpointKey()) dot.classList.add("current");
      progressDots.append(dot);
    }
  }
}

function showOverlay(name) {
  startOverlay.hidden = name !== "start";
  confirmOverlay.hidden = name !== "confirm";
  stepOverlay.hidden = name !== "step";
  doneOverlay.hidden = name !== "done";
}

function setStepButton(label, disabled = false) {
  stepButton.textContent = label;
  stepButton.disabled = !!disabled || busy;
}

function renderStep() {
  if (mode === "prepare") {
    showOverlay("start");
    return;
  }
  if (mode === "done") {
    showOverlay("done");
    doneId.textContent = `robot id: ${selectedRobotId()}`;
    return;
  }
  if (mode === "finish") {
    showOverlay("step");
    cueArrow.textContent = "✓";
    cueVerb.textContent = "All endpoints recorded";
    stepStatus.textContent = "ready to save";
    setStepButton("SAVE");
    renderProgress();
    return;
  }
  // record
  showOverlay("step");
  const step = currentStep();
  if (!step) return;
  const key = currentEndpointKey();
  const cue = DIRECTION_CUES[step.joint]?.[key] ?? { glyph: "→", verb: `Move ${step.label} ${step[key]}` };
  cueArrow.textContent = cue.glyph;
  cueVerb.textContent = cue.verb;
  stepStatus.textContent = `${stepIndex * 2 + endpointIndex + 1} / ${steps.length * 2} · ${step.label}`;
  setStepButton("RECORD");
  renderProgress();
}

function updateAlignment() {
  if (mode !== "record") return;
  const step = currentStep();
  if (!step) return;
  cueVerb.classList.remove("aligned");
  const stepNum = `${stepIndex * 2 + endpointIndex + 1} / ${steps.length * 2}`;
  // First endpoint: no reference exists yet, so don't pretend to measure alignment.
  if (endpointIndex === 0) {
    stepStatus.textContent = `${stepNum} · move to the limit, then press RECORD`;
    return;
  }
  stepStatus.textContent = `${stepNum} · ${step.label} · press RECORD at the opposite limit`;
}

function advance() {
  if (endpointIndex === 0) endpointIndex = 1;
  else { endpointIndex = 0; stepIndex += 1; }
  if (stepIndex >= steps.length) mode = "finish";
  showError(null);
  renderStep();
}

async function refreshRobots() {
  robotSelect.replaceChildren();
  startStatus.textContent = "Scanning for arms…";
  startButton.disabled = true;
  try {
    const parsed = parseToolJson(await window.chem0.callTool("list_connected_robots", { max_id: 12 }));
    const robots = Array.isArray(parsed.robots) ? parsed.robots : [];
    robotSelect.replaceChildren();
    for (const robot of robots) {
      const option = document.createElement("option");
      const port = String(robot.port ?? "");
      const ids = Array.isArray(robot.servo_ids) ? robot.servo_ids.join(",") : "";
      option.value = port;
      option.textContent = `${port.replace(/^\/dev\/tty\./, "")} · IDs ${ids || "none"}`;
      if (typeof robot.suggested_robot_id === "string") option.dataset.robotId = robot.suggested_robot_id;
      robotSelect.append(option);
    }
    if (robots.length === 0) {
      startStatus.textContent = "No arms detected. Connect one and try again.";
      const option = document.createElement("option");
      option.textContent = "—";
      robotSelect.append(option);
      startButton.disabled = true;
    } else {
      startStatus.textContent = `${robots.length} arm${robots.length === 1 ? "" : "s"} detected`;
      startButton.disabled = false;
      startLivePolling();
    }
  } catch (error) {
    startStatus.textContent = error instanceof Error ? error.message : String(error);
    startButton.disabled = true;
  }
}

async function pollLivePositions() {
  if (pollPaused) return;
  const port = selectedPort();
  if (!port) return;
  try {
    const result = await window.chem0.callTool("read_so101_raw_positions", { port });
    if (result?.isError) return;
    const parsed = parseToolJson(result);
    livePositions = Object.fromEntries(Object.entries(parsed.positions ?? {}).map(([joint, value]) => [joint, Number(value)]));
  } catch {
    // The explicit calibration actions surface actionable errors.
  }
}

function toolErrorMessage(result) {
  if (!result?.isError) return null;
  const text = Array.isArray(result.content)
    ? result.content.map((c) => c?.text).filter(Boolean).join("\n")
    : "";
  return text || "Tool call failed.";
}

function showError(message) {
  if (!message) {
    stepError.textContent = "";
    stepError.hidden = true;
    return;
  }
  stepError.textContent = message;
  stepError.hidden = false;
}

function startLivePolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  void pollLivePositions();
  pollTimer = window.setInterval(() => void pollLivePositions(), 700);
}

function openConfirm() {
  if (!selectedPort()) {
    startStatus.textContent = "Select an arm first.";
    return;
  }
  showOverlay("confirm");
}

function cancelConfirm() {
  showOverlay("start");
}

async function handleStart() {
  if (busy) return;
  busy = true;
  pollPaused = true;
  confirmStartButton.disabled = true;
  confirmCancelButton.disabled = true;
  startStatus.textContent = "Preparing arm…";
  showOverlay("start");
  startButton.disabled = true;
  try {
    const port = selectedPort();
    if (!port) throw new Error("Select an arm first.");
    const result = await window.chem0.callTool("prepare_so101_calibration", { port });
    const errMsg = toolErrorMessage(result);
    if (errMsg) throw new Error(errMsg);
    const parsed = parseToolJson(result);
    if (Array.isArray(parsed.steps)) steps = parsed.steps;
    stepIndex = 0;
    endpointIndex = 0;
    records = {};
    mode = "record";
    showError(null);
  } catch (error) {
    startStatus.textContent = error instanceof Error ? error.message : String(error);
    startButton.disabled = false;
  } finally {
    busy = false;
    pollPaused = false;
    confirmStartButton.disabled = false;
    confirmCancelButton.disabled = false;
    renderStep();
  }
}

async function handleStepButton() {
  if (busy) return;
  busy = true;
  pollPaused = true;
  setStepButton(stepButton.textContent, true);
  let errorMessage = null;
  try {
    if (mode === "record") errorMessage = await doRecord();
    else if (mode === "finish") errorMessage = await doFinish();
  } finally {
    busy = false;
    pollPaused = false;
    renderStep();
    showError(errorMessage);
  }
}

async function doRecord() {
  const step = currentStep();
  if (!step) return null;
  try {
    const result = await window.chem0.callTool("read_so101_calibration_endpoint", {
      port: selectedPort(),
      joint: step.joint,
      samples: 5
    });
    const errMsg = toolErrorMessage(result);
    if (errMsg) return errMsg;
    const parsed = parseToolJson(result);
    const raw = Number(parsed.raw_position);
    if (!Number.isFinite(raw)) return "Endpoint read did not return a raw_position.";
    const rec = records[step.joint] ?? {};
    rec[currentEndpointKey()] = raw;
    records[step.joint] = rec;
    advance();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function doFinish() {
  try {
    const result = await window.chem0.callTool("finalize_so101_calibration", {
      port: selectedPort(),
      robot_id: selectedRobotId(),
      records,
      write_motors: true
    });
    const errMsg = toolErrorMessage(result);
    if (errMsg) return errMsg;
    mode = "done";
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

robotSelect.addEventListener("change", () => { startLivePolling(); });
startButton.addEventListener("click", openConfirm);
confirmCancelButton.addEventListener("click", cancelConfirm);
confirmStartButton.addEventListener("click", () => void handleStart());
stepButton.addEventListener("click", () => void handleStepButton());
closeButton.addEventListener("click", () => window.close());

window.addEventListener("beforeunload", () => {
  if (pollTimer) window.clearInterval(pollTimer);
  if (animationFrame) cancelAnimationFrame(animationFrame);
  renderer?.dispose();
});

renderStep();
void loadRobotModel().catch(failLoudly);
void refreshRobots();
