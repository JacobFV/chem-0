import * as THREE from "three";
import { STLLoader } from "./vendor/STLLoader.js";

const rootEl = document.querySelector("#robot-views");
const JOINTS = ["shoulder_pan", "shoulder_lift", "elbow_flex", "wrist_flex", "wrist_roll", "gripper"];
const robotViews = new Map();

let robotAsset = null;

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
    materials[name] = { color: new THREE.Color(v[0], v[1], v[2]) };
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

function materialFor(name, materials) {
  const source = materials[name] ?? materials["3d_printed"];
  return new THREE.MeshStandardMaterial({
    color: source?.color ?? new THREE.Color(0xffd21f),
    roughness: 0.72,
    metalness: 0.05
  });
}

async function loadStl(loader, url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

async function loadRobotAsset() {
  if (robotAsset) return robotAsset;
  const response = await fetch("./robot-assets/so101/so101_new_calib.urdf");
  const urdf = parseUrdf(await response.text());
  const loader = new STLLoader();
  const geometryCache = new Map();
  for (const link of Object.values(urdf.links)) {
    for (const visual of link.visuals) {
      if (!visual.mesh.endsWith(".stl")) continue;
      const url = `./robot-assets/so101/${visual.mesh}`;
      if (geometryCache.has(url)) continue;
      const geometry = await loadStl(loader, url);
      geometry.computeVertexNormals();
      geometryCache.set(url, geometry);
    }
  }
  robotAsset = { urdf, geometryCache };
  return robotAsset;
}

function buildRobotModel(asset) {
  const root = new THREE.Group();
  root.scale.setScalar(3.2);
  root.rotation.x = -Math.PI / 2;
  root.rotation.z = Math.PI;
  const linkGroups = {};
  const jointMotion = {};

  for (const linkName of Object.keys(asset.urdf.links)) {
    const group = new THREE.Group();
    group.name = linkName;
    linkGroups[linkName] = group;
  }

  for (const link of Object.values(asset.urdf.links)) {
    const group = linkGroups[link.name];
    for (const visual of link.visuals) {
      if (!visual.mesh.endsWith(".stl")) continue;
      const geometry = asset.geometryCache.get(`./robot-assets/so101/${visual.mesh}`);
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, materialFor(visual.material, asset.urdf.materials));
      mesh.position.copy(visual.xyz);
      mesh.rotation.copy(visual.rpy);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  const childLinks = new Set(asset.urdf.joints.map((joint) => joint.child));
  const rootLink = Object.keys(asset.urdf.links).find((name) => !childLinks.has(name)) ?? "base_link";
  root.add(linkGroups[rootLink]);

  for (const joint of asset.urdf.joints) {
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
  const motions = robot.userData.jointMotion ?? {};
  for (const [name, entry] of Object.entries(motions)) {
    entry.motion.quaternion.identity();
    if (entry.type !== "fixed") entry.motion.quaternion.setFromAxisAngle(entry.axis, rawAngle(positions, name));
  }
}

function createScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
  const orbit = {
    target: new THREE.Vector3(0, 0, 0.16),
    radius: 2.9,
    theta: -0.84,
    phi: 1.12,
    dragging: false,
    lastX: 0,
    lastY: 0
  };
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  container.append(renderer.domElement);
  updateOrbitCamera(camera, orbit);
  installOrbitControls(renderer.domElement, orbit, () => updateOrbitCamera(camera, orbit));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.3);
  key.position.set(1.2, -1.4, 1.6);
  scene.add(key);
  const grid = new THREE.GridHelper(1.0, 10, 0x303030, 0x151515);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);
  return { scene, camera, renderer, orbit };
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
    state.phi = Math.max(0.18, Math.min(Math.PI - 0.18, state.phi + dy * 0.008));
    update();
  });
  element.addEventListener("pointerup", (event) => {
    state.dragging = false;
    element.releasePointerCapture(event.pointerId);
  });
  element.addEventListener("pointercancel", () => {
    state.dragging = false;
  });
}

function resizeView(view) {
  const rect = view.canvasHost.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  view.renderer.setSize(width, height, false);
  view.camera.aspect = width / height;
  view.camera.updateProjectionMatrix();
}

async function createRobotView(robot) {
  if (!rootEl || robotViews.has(robot.port)) return;
  const asset = await loadRobotAsset();
  const card = document.createElement("div");
  card.className = "robot-view-cell";
  const frame = document.createElement("div");
  frame.className = "robot-view-frame";
  const label = document.createElement("div");
  label.className = "camera-label";
  label.textContent = `${robot.suggested_robot_id ?? "so101"} · ${robot.port}`;
  card.append(frame, label);
  rootEl.append(card);

  const { scene, camera, renderer } = createScene(frame);
  const model = buildRobotModel(asset);
  scene.add(model);
  const view = { port: robot.port, card, canvasHost: frame, scene, camera, renderer, model, positions: {} };
  robotViews.set(robot.port, view);
  resizeView(view);
}

async function refreshRobotViews() {
  if (!rootEl || !window.chem0) return;
  const parsed = parseToolJson(await window.chem0.callTool("list_connected_robots", { max_id: 12 }));
  const robots = Array.isArray(parsed.robots) ? parsed.robots.filter((robot) => robot.looks_like_so101) : [];
  const ports = new Set(robots.map((robot) => robot.port));
  for (const [port, view] of robotViews) {
    if (ports.has(port)) continue;
    view.renderer.dispose();
    view.card.remove();
    robotViews.delete(port);
  }
  for (const robot of robots) await createRobotView(robot);
}

async function pollPoses() {
  for (const view of robotViews.values()) {
    try {
      const parsed = parseToolJson(await window.chem0.callTool("read_so101_raw_positions", { port: view.port }));
      view.positions = Object.fromEntries(Object.entries(parsed.positions ?? {}).filter(([joint]) => JOINTS.includes(joint)));
      setRobotPose(view.model, view.positions);
    } catch {
      // Keep last rendered pose; robot disconnects are reflected by refreshRobotViews.
    }
  }
}

function animate() {
  for (const view of robotViews.values()) {
    resizeView(view);
    view.renderer.render(view.scene, view.camera);
  }
  requestAnimationFrame(animate);
}

async function boot3d() {
  try {
    await refreshRobotViews();
    await pollPoses();
    setInterval(() => void refreshRobotViews(), 8000);
    setInterval(() => void pollPoses(), 700);
    animate();
  } catch (error) {
    if (rootEl) rootEl.textContent = error instanceof Error ? error.message : String(error);
  }
}

void boot3d();
