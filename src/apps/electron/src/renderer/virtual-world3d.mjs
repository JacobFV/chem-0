import * as THREE from "three";
import { STLLoader } from "./vendor/STLLoader.js";
import { TransformControls } from "./vendor/TransformControls.js";

const root = document.querySelector("#vw-scene");
const banner = document.querySelector("#vw-collision-banner");
const dropStatus = document.querySelector("#vw-drop-status");

function editorApi() {
  return window.virtualWorldEditor;
}

function updateOrbitCamera() {
  const offset = new THREE.Vector3(0, 0, orbit.radius).applyQuaternion(orbit.orientation);
  camera.position.copy(orbit.target).add(offset);
  camera.quaternion.copy(orbit.orientation);
}

function installOrbitControls(element, state, update) {
  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || draggingTransform) return;
    state.dragging = true;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    element.setPointerCapture(event.pointerId);
  });
  element.addEventListener("pointermove", (event) => {
    if (!state.dragging || draggingTransform) return;
    const dx = event.clientX - state.lastX;
    const dy = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(state.orientation);
    const screenRight = new THREE.Vector3(1, 0, 0).applyQuaternion(state.orientation);
    const yaw = new THREE.Quaternion().setFromAxisAngle(screenUp, -dx * 0.008);
    const pitch = new THREE.Quaternion().setFromAxisAngle(screenRight, -dy * 0.008);
    state.orientation.premultiply(yaw).premultiply(pitch).normalize();
    update();
  });
  element.addEventListener("pointerup", (event) => {
    state.dragging = false;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  });
  element.addEventListener("pointercancel", () => {
    state.dragging = false;
  });
}

const PALETTE = {
  light: {
    bg: 0xf2f3f5,
    floor: 0xe4e4e7,
    gridA: 0xb0b0b3,
    gridB: 0xd0d0d3,
    rigid: 0xc0c0c0,
    arm: 0xd8bd55,
    wire: 0x3f3f46,
    hemiSky: 0xffffff,
    hemiGround: 0xc7c8cb,
    hemiI: 1.1,
    keyI: 0.85
  },
  dark: {
    bg: 0x020202,
    floor: 0x1a1a1a,
    gridA: 0x303030,
    gridB: 0x151515,
    rigid: 0x8d8d8d,
    arm: 0xd8bd55,
    wire: 0xcccccc,
    hemiSky: 0xffffff,
    hemiGround: 0x202020,
    hemiI: 1.2,
    keyI: 1.0
  }
};

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE[currentTheme()].bg);

const camera = new THREE.PerspectiveCamera(62, 1, 0.01, 20);
const orbit = {
  target: new THREE.Vector3(0, 0, 0.08),
  radius: 1.45,
  orientation: new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.59)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.02)),
  dragging: false,
  lastX: 0,
  lastY: 0
};
updateOrbitCamera();

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.append(renderer.domElement);
installOrbitControls(renderer.domElement, orbit, updateOrbitCamera);

const translateTransform = new TransformControls(camera, renderer.domElement);
translateTransform.setMode("translate");
translateTransform.setSpace("world");
translateTransform.setSize(0.85);
translateTransform.showXY = false;
translateTransform.showYZ = false;
translateTransform.showXZ = false;
scene.add(translateTransform.getHelper());

const rotateTransform = new TransformControls(camera, renderer.domElement);
rotateTransform.setMode("rotate");
rotateTransform.setSpace("local");
rotateTransform.setSize(0.95);
scene.add(rotateTransform.getHelper());

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x202020, 1.2);
scene.add(hemiLight);
const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
keyLight.position.set(1.3, -1.1, 1.4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.1;
keyLight.shadow.camera.far = 6;
keyLight.shadow.camera.left = -1.0;
keyLight.shadow.camera.right = 1.0;
keyLight.shadow.camera.top = 1.0;
keyLight.shadow.camera.bottom = -1.0;
keyLight.shadow.bias = -0.0005;
keyLight.shadow.normalBias = 0.02;
keyLight.shadow.radius = 4;
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
fillLight.position.set(-1.0, 1.2, 0.8);
scene.add(fillLight);

const FLOOR_Z = 0;
const GRAVITY_M_PER_FRAME = 0.006;
const PHYSICS_WATCHDOG_INTERVAL_MS = 1000;
const PHYSICS_PERSIST_SETTLE_MS = 250;
const PHYSICS_PERSIST_INTERVAL_MS = 600;
const CONTACT_EPSILON_M = 0.0005;
const FLOOR_SIZE_M = 1.6;
const SELECTED_OUTLINE_COLOR = 0x10d8ff;
const floorMaterial = new THREE.MeshStandardMaterial({ color: PALETTE[currentTheme()].floor, roughness: 0.92, metalness: 0.02 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE_M, FLOOR_SIZE_M), floorMaterial);
floor.receiveShadow = true;
floor.position.z = FLOOR_Z;
scene.add(floor);

let grid = new THREE.GridHelper(1.2, 24, PALETTE[currentTheme()].gridA, PALETTE[currentTheme()].gridB);
grid.rotation.x = Math.PI / 2;
grid.position.z = FLOOR_Z + 0.001;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const dropPoint = new THREE.Vector3();
const objects = new Map();
const pickables = [];
const selectionOutlineMaterial = new THREE.MeshBasicMaterial({
  color: SELECTED_OUTLINE_COLOR,
  depthTest: false,
  depthWrite: false,
  side: THREE.BackSide,
  toneMapped: false
});
let entities = [];
let selectedId = "";
let draggingTransform = false;
let backgroundClick = null;
let dropStatusTimer = 0;
let transformMode = "translate";
let robotAsset = null;
let rebuildSequence = 0;
let lastPhysicsPersistMs = 0;
let lastPhysicsChangeMs = 0;
const physicsDirtyIds = new Set();

const materials = {
  arm: new THREE.MeshStandardMaterial({ color: PALETTE[currentTheme()].arm, roughness: 0.55 }),
  camera: new THREE.MeshStandardMaterial({ color: 0x5aa9d8, roughness: 0.5 }),
  light: new THREE.MeshStandardMaterial({ color: 0xf0e7a2, emissive: 0x5c511d, roughness: 0.35 }),
  rigid_body: new THREE.MeshStandardMaterial({ color: PALETTE[currentTheme()].rigid, roughness: 0.7 }),
  selected: new THREE.MeshStandardMaterial({ color: 0xd9d4b2, roughness: 0.55 }),
  collision: new THREE.MeshStandardMaterial({ color: 0xff4f4f, roughness: 0.5 })
};

function applyThemePalette() {
  const p = PALETTE[currentTheme()];
  scene.background = new THREE.Color(p.bg);
  floorMaterial.color.setHex(p.floor);
  hemiLight.intensity = p.hemiI;
  keyLight.intensity = p.keyI;
  materials.arm.color.setHex(p.arm);
  materials.rigid_body.color.setHex(p.rigid);
  scene.remove(grid);
  grid = new THREE.GridHelper(1.2, 24, p.gridA, p.gridB);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = FLOOR_Z + 0.001;
  scene.add(grid);
  for (const group of objects.values()) {
    if (group.userData.recolorWire) group.userData.recolorWire();
  }
}

new MutationObserver(() => applyThemePalette()).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"]
});

function axisCenter(object) {
  if (!object.geometry) return new THREE.Vector3();
  if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
  const center = new THREE.Vector3();
  object.geometry.boundingBox.getCenter(center);
  return center;
}

function shouldRemoveTranslateHandle(handle) {
  if (["XY", "YZ", "XZ", "XYZ"].includes(handle.name)) return true;
  if (!["X", "Y", "Z"].includes(handle.name)) return false;
  const center = axisCenter(handle);
  const axisValue = handle.name === "X" ? center.x : handle.name === "Y" ? center.y : center.z;
  return axisValue < -0.001;
}

function pruneTranslateHandles(control) {
  const gizmo = control._gizmo;
  const groups = [gizmo?.gizmo?.translate, gizmo?.picker?.translate, gizmo?.helper?.translate];
  for (const group of groups) {
    if (!group) continue;
    for (const handle of [...group.children]) {
      if (shouldRemoveTranslateHandle(handle)) group.remove(handle);
    }
  }
}

function hideRemovedTranslateHandleTypes(control) {
  const gizmo = control._gizmo;
  const groups = [gizmo?.gizmo?.translate, gizmo?.picker?.translate, gizmo?.helper?.translate];
  for (const group of groups) {
    if (!group) continue;
    for (const handle of group.children) {
      if (shouldRemoveTranslateHandle(handle)) handle.visible = false;
    }
  }
}

function setTransformMode(mode) {
  transformMode = mode === "rotate" ? "rotate" : "translate";
  translateTransform.enabled = transformMode === "translate";
  rotateTransform.enabled = transformMode === "rotate";
  translateTransform.getHelper().visible = translateTransform.enabled && translateTransform.object !== undefined;
  rotateTransform.getHelper().visible = rotateTransform.enabled && rotateTransform.object !== undefined;
  hideRemovedTranslateHandleTypes(translateTransform);
}

function activeTransformControl() {
  return transformMode === "rotate" ? rotateTransform : translateTransform;
}

function transformControlHasPointer() {
  const control = activeTransformControl();
  return Boolean(control.dragging || control.axis);
}

function installTransformEvents(control) {
  control.addEventListener("dragging-changed", (event) => {
    draggingTransform = Boolean(event.value);
    if (draggingTransform) orbit.dragging = false;
  });

  control.addEventListener("objectChange", () => {
    settleRigidBodies(true);
    updateCollisions();
  });

  control.addEventListener("mouseUp", () => {
    const group = control.object;
    if (!group?.userData?.entityId) return;
    const id = String(group.userData.entityId);
    settleRigidBodies(true);
    physicsDirtyIds.delete(id);
    persistGroupPose(id, group);
  });
}

pruneTranslateHandles(translateTransform);

function entityPose(entity) {
  const pose = entity?.pose && typeof entity.pose === "object" && !Array.isArray(entity.pose) ? entity.pose : {};
  return {
    x: Number(pose.x) || 0,
    y: Number(pose.y) || 0,
    z: Number(pose.z) || 0,
    roll: Number(pose.roll) || 0,
    pitch: Number(pose.pitch) || 0,
    yaw: Number(pose.yaw) || 0
  };
}

function entitySpec(entity) {
  return entity?.spec && typeof entity.spec === "object" && !Array.isArray(entity.spec) ? entity.spec : {};
}

function parseVector(raw) {
  const values = String(raw ?? "0 0 0").trim().split(/\s+/).map(Number);
  return new THREE.Vector3(values[0] || 0, values[1] || 0, values[2] || 0);
}

function parseRpy(raw) {
  const values = String(raw ?? "0 0 0").trim().split(/\s+/).map(Number);
  const roll = values[0] || 0;
  const pitch = values[1] || 0;
  const yaw = values[2] || 0;
  const matrix = new THREE.Matrix4()
    .makeRotationZ(yaw)
    .multiply(new THREE.Matrix4().makeRotationY(pitch))
    .multiply(new THREE.Matrix4().makeRotationX(roll));
  return new THREE.Quaternion().setFromRotationMatrix(matrix);
}

function parseUrdf(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const parseError = xml.querySelector("parsererror");
  if (parseError) throw new Error(`SO-101 URDF parse failed: ${parseError.textContent || "invalid XML"}`);
  const urdfMaterials = {};
  for (const material of xml.querySelectorAll("robot > material")) {
    const name = material.getAttribute("name") ?? "";
    const rgba = material.querySelector("color")?.getAttribute("rgba");
    if (!name || !rgba) continue;
    const v = rgba.split(/\s+/).map(Number);
    urdfMaterials[name] = { color: new THREE.Color(v[0], v[1], v[2]) };
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
  return { links, joints, materials: urdfMaterials };
}

function materialFor(name, urdfMaterials) {
  const source = urdfMaterials[name] ?? urdfMaterials["3d_printed"];
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
  if (!response.ok) throw new Error(`SO-101 URDF load failed: ${response.status}`);
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
  const modelRoot = new THREE.Group();
  modelRoot.scale.setScalar(3.2);
  modelRoot.rotation.x = -Math.PI / 2;
  modelRoot.rotation.z = Math.PI;
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
      mesh.quaternion.copy(visual.rpy);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  const childLinks = new Set(asset.urdf.joints.map((joint) => joint.child));
  const rootLink = Object.keys(asset.urdf.links).find((name) => !childLinks.has(name)) ?? "base_link";
  modelRoot.add(linkGroups[rootLink]);

  for (const joint of asset.urdf.joints) {
    const parent = linkGroups[joint.parent];
    const child = linkGroups[joint.child];
    if (!parent || !child) continue;
    const origin = new THREE.Group();
    origin.position.copy(joint.xyz);
    origin.quaternion.copy(joint.rpy);
    const motion = new THREE.Group();
    origin.add(motion);
    motion.add(child);
    parent.add(origin);
    jointMotion[joint.name] = { motion, axis: joint.axis, type: joint.type };
  }

  modelRoot.userData.jointMotion = jointMotion;
  return modelRoot;
}

function setGroupPose(group, entity) {
  const pose = entityPose(entity);
  group.position.set(pose.x, pose.y, pose.z);
  group.rotation.set(THREE.MathUtils.degToRad(pose.roll), THREE.MathUtils.degToRad(pose.pitch), THREE.MathUtils.degToRad(pose.yaw));
}

function applyMaterial(group, material) {
  group.traverse((node) => {
    if (!node.isMesh || node.userData.isCameraHitbox || node.userData.isSelectionOutline) return;
    if (material === null) {
      if (node.userData.originalMaterial) node.material = node.userData.originalMaterial;
    } else {
      node.material = material;
    }
  });
}

function setSelectionOutline(group, visible) {
  group.traverse((node) => {
    if (!node.isMesh || node.userData.isCameraHitbox || node.userData.isSelectionOutline) return;
    if (!node.userData.selectionOutline) {
      const outline = new THREE.Mesh(node.geometry, selectionOutlineMaterial);
      outline.name = "selection_outline";
      outline.renderOrder = Infinity;
      outline.userData.isSelectionOutline = true;
      outline.scale.setScalar(1.045);
      node.add(outline);
      node.userData.selectionOutline = outline;
    }
    node.userData.selectionOutline.visible = visible;
  });
}

function withSelectionOutlinesHidden(fn) {
  const visibleOutlines = [];
  scene.traverse((node) => {
    if (node.userData?.isSelectionOutline && node.visible) {
      visibleOutlines.push(node);
      node.visible = false;
    }
  });
  try {
    return fn();
  } finally {
    for (const node of visibleOutlines) node.visible = true;
  }
}

function boxFromObjectWithoutSelectionOutline(object) {
  return withSelectionOutlinesHidden(() => new THREE.Box3().setFromObject(object));
}

function boxMesh(size, material) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCamera(entity) {
  return buildCameraWireframe(entity);
}

function buildCameraWireframe(entity) {
  const spec = entitySpec(entity ?? {});
  const fovDeg = Number(spec?.fov_degrees) || 75;
  const len = 0.07;
  const halfFov = THREE.MathUtils.degToRad(fovDeg) / 2;
  const w = Math.tan(halfFov) * len;
  const aspect = 16 / 9;
  const h = w / aspect;

  // forward = -Y in this scene's camera convention (cameraFromEntity rotates -90° on X).
  const apex = [0, 0, 0];
  const ftr = [ w, -len,  h];
  const ftl = [-w, -len,  h];
  const fbr = [ w, -len, -h];
  const fbl = [-w, -len, -h];

  // "up" indicator triangle on top of the frustum (Blender camera style).
  const tipUp = [0, -len * 0.55,  h * 1.85];
  const baseUpL = [-w * 0.55, -len * 0.35,  h * 1.05];
  const baseUpR = [ w * 0.55, -len * 0.35,  h * 1.05];

  const positions = new Float32Array([
    // frustum edges from apex
    ...apex, ...ftr,
    ...apex, ...ftl,
    ...apex, ...fbr,
    ...apex, ...fbl,
    // far rectangle
    ...ftr, ...ftl,
    ...ftl, ...fbl,
    ...fbl, ...fbr,
    ...fbr, ...ftr,
    // up triangle
    ...baseUpL, ...baseUpR,
    ...baseUpR, ...tipUp,
    ...tipUp,   ...baseUpL
  ]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const lineMat = new THREE.LineBasicMaterial({ color: PALETTE[currentTheme()].wire });
  const lines = new THREE.LineSegments(geom, lineMat);

  // Invisible hitbox so picking still works on the camera.
  const hitGeom = new THREE.BoxGeometry(w * 2.2, len * 1.1, h * 2.4);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitbox = new THREE.Mesh(hitGeom, hitMat);
  hitbox.position.y = -len / 2;
  hitbox.userData.isCameraHitbox = true;

  const group = new THREE.Group();
  group.add(lines, hitbox);
  group.userData.cameraLines = lines;
  group.userData.cameraLineMat = lineMat;
  group.userData.recolorWire = (overrideHex) => {
    const target = overrideHex ?? PALETTE[currentTheme()].wire;
    lineMat.color.setHex(target);
  };
  return group;
}

function makeLight() {
  const group = new THREE.Group();
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 20, 12), materials.light);
  const helper = new THREE.PointLight(0xffffff, 0.8, 2);
  group.add(bulb, helper);
  return group;
}

const assetMaterials = {
  glass: new THREE.MeshStandardMaterial({ color: 0xe6f3ff, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.32, side: THREE.DoubleSide }),
  glass_amber: new THREE.MeshStandardMaterial({ color: 0xa86f24, roughness: 0.18, metalness: 0.0, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  cap_white: new THREE.MeshStandardMaterial({ color: 0xeae6d6, roughness: 0.55 }),
  cap_blue: new THREE.MeshStandardMaterial({ color: 0x2f5b91, roughness: 0.5 }),
  cap_red: new THREE.MeshStandardMaterial({ color: 0x8a2a1f, roughness: 0.55 }),
  cap_green: new THREE.MeshStandardMaterial({ color: 0x2c6f3a, roughness: 0.55 }),
  cap_black: new THREE.MeshStandardMaterial({ color: 0x1d1d1f, roughness: 0.6 }),
  plastic_white: new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.6 }),
  plastic_dark: new THREE.MeshStandardMaterial({ color: 0x26272a, roughness: 0.6 }),
  panel: new THREE.MeshStandardMaterial({ color: 0xcfcec8, roughness: 0.55, metalness: 0.25 }),
  panel_dark: new THREE.MeshStandardMaterial({ color: 0x3d3f44, roughness: 0.55, metalness: 0.35 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb6b8bd, roughness: 0.32, metalness: 0.85 }),
  steel_dark: new THREE.MeshStandardMaterial({ color: 0x6b6e74, roughness: 0.4, metalness: 0.8 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xf2efe5, roughness: 0.65 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.9 }),
  wood: new THREE.MeshStandardMaterial({ color: 0xa3865a, roughness: 0.78 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x12382a, emissive: 0x0d3322, emissiveIntensity: 0.9, roughness: 0.35 }),
  led_green: new THREE.MeshStandardMaterial({ color: 0x46f08e, emissive: 0x1eaa4c, emissiveIntensity: 1.1, roughness: 0.3 }),
  led_red: new THREE.MeshStandardMaterial({ color: 0xff6a4d, emissive: 0xaa2010, emissiveIntensity: 1.0, roughness: 0.3 }),
  liquid_blue: new THREE.MeshStandardMaterial({ color: 0x3e8fc4, roughness: 0.25, transparent: true, opacity: 0.78 }),
  liquid_yellow: new THREE.MeshStandardMaterial({ color: 0xe4c64a, roughness: 0.28, transparent: true, opacity: 0.78 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb89651, roughness: 0.4, metalness: 0.75 }),
  paper_white: new THREE.MeshStandardMaterial({ color: 0xfafaf6, roughness: 0.92 })
};

function assetMeshWrap(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function vcyl(rTop, rBottom, h, material, segments = 24, openEnded = false) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments, 1, openEnded), material);
  mesh.rotation.x = Math.PI / 2;
  return assetMeshWrap(mesh);
}

function hcyl(rTop, rBottom, length, material, axis = "x", segments = 18) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, length, segments), material);
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  else if (axis === "y") mesh.rotation.set(0, 0, 0);
  return assetMeshWrap(mesh);
}

function disk(radius, thickness, material, segments = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thickness, segments), material);
  mesh.rotation.x = Math.PI / 2;
  return assetMeshWrap(mesh);
}

function bx(w, d, h, material) {
  return assetMeshWrap(new THREE.Mesh(new THREE.BoxGeometry(w, d, h), material));
}

function sph(radius, material, ws = 18, hs = 14) {
  return assetMeshWrap(new THREE.Mesh(new THREE.SphereGeometry(radius, ws, hs), material));
}

function hemi(radius, material, ws = 18, hs = 10) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2), material);
  mesh.rotation.x = Math.PI;
  return assetMeshWrap(mesh);
}

function torus(radius, tube, material, radial = 8, tubular = 24) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, radial, tubular), material);
  return assetMeshWrap(mesh);
}

function placeAt(mesh, x, y, z) {
  mesh.position.set(x, y, z);
  return mesh;
}

function buildVialSmall(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.006;
  const totalH = Number(spec.height_m) || 0.045;
  const coneH = totalH * 0.27;
  const bodyH = totalH * 0.58;
  const capH = totalH * 0.15;
  const cone = vcyl(r, r * 0.18, coneH, assetMaterials.glass, 16);
  placeAt(cone, 0, 0, coneH / 2);
  const body = vcyl(r, r, bodyH, assetMaterials.glass, 18, true);
  placeAt(body, 0, 0, coneH + bodyH / 2);
  const cap = vcyl(r * 1.02, r * 1.02, capH, assetMaterials.cap_white, 18);
  placeAt(cap, 0, 0, coneH + bodyH + capH / 2);
  const hinge = bx(r * 0.5, r * 0.6, capH * 0.4, assetMaterials.cap_white);
  placeAt(hinge, 0, r * 0.9, coneH + bodyH + capH * 0.5);
  g.add(cone, body, cap, hinge);
  return g;
}

function buildVialScrewCap(spec, capMaterial) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.009;
  const totalH = Number(spec.height_m) || 0.05;
  const capH = totalH * 0.24;
  const bodyH = totalH - capH;
  const liquidH = bodyH * 0.55;
  const body = vcyl(r, r, bodyH, assetMaterials.glass, 22);
  placeAt(body, 0, 0, bodyH / 2);
  const liquid = vcyl(r * 0.94, r * 0.94, liquidH, assetMaterials.liquid_blue, 22);
  placeAt(liquid, 0, 0, liquidH / 2);
  const cap = vcyl(r * 1.08, r * 1.08, capH, capMaterial, 22);
  placeAt(cap, 0, 0, bodyH + capH / 2);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const rib = bx(r * 0.06, r * 0.06, capH * 0.85, capMaterial);
    placeAt(rib, Math.cos(angle) * r * 1.06, Math.sin(angle) * r * 1.06, bodyH + capH / 2);
    g.add(rib);
  }
  g.add(body, liquid, cap);
  return g;
}

function buildTestTube(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.0075;
  const totalH = Number(spec.height_m) || 0.1;
  const bodyH = totalH - r;
  const rimH = totalH * 0.02;
  const body = vcyl(r, r, bodyH, assetMaterials.glass, 22, true);
  placeAt(body, 0, 0, r + bodyH / 2);
  const rim = torus(r, rimH, assetMaterials.glass, 8, 22);
  placeAt(rim, 0, 0, r + bodyH);
  const bottom = sph(r, assetMaterials.glass, 22, 12);
  placeAt(bottom, 0, 0, r);
  bottom.scale.z = 1.0;
  const liquidH = bodyH * 0.35;
  const liquid = vcyl(r * 0.93, r * 0.93, liquidH, assetMaterials.liquid_blue, 22);
  placeAt(liquid, 0, 0, r + liquidH / 2);
  g.add(body, rim, bottom, liquid);
  return g;
}

function buildBeaker(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.021;
  const h = Number(spec.height_m) || 0.055;
  const wall = r * 0.04;
  const outer = vcyl(r, r, h, assetMaterials.glass, 28, true);
  placeAt(outer, 0, 0, h / 2);
  const inner = vcyl(r - wall, r - wall, h - wall, assetMaterials.glass, 28, true);
  placeAt(inner, 0, 0, h / 2 + wall * 0.5);
  const base = disk(r, wall * 1.2, assetMaterials.glass, 28);
  placeAt(base, 0, 0, wall * 0.6);
  const rim = torus(r, wall * 0.7, assetMaterials.glass, 6, 28);
  placeAt(rim, 0, 0, h);
  const liquidH = h * 0.45;
  const liquid = vcyl(r - wall * 1.4, r - wall * 1.4, liquidH, assetMaterials.liquid_blue, 28);
  placeAt(liquid, 0, 0, wall + liquidH / 2);
  const spout = bx(r * 0.18, r * 0.5, h * 0.08, assetMaterials.glass);
  placeAt(spout, r * 0.95, 0, h - h * 0.05);
  spout.rotation.z = Math.PI / 8;
  g.add(outer, inner, base, rim, liquid, spout);
  return g;
}

function buildErlenmeyer(spec) {
  const g = new THREE.Group();
  const rBody = Number(spec.radius_m) || 0.04;
  const h = Number(spec.height_m) || 0.13;
  const neckH = h * 0.22;
  const neckR = rBody * 0.32;
  const coneH = h - neckH;
  const wall = rBody * 0.025;
  const cone = vcyl(neckR, rBody, coneH, assetMaterials.glass, 32, true);
  placeAt(cone, 0, 0, coneH / 2);
  const base = disk(rBody, wall * 1.5, assetMaterials.glass, 32);
  placeAt(base, 0, 0, wall * 0.75);
  const neck = vcyl(neckR, neckR, neckH, assetMaterials.glass, 24, true);
  placeAt(neck, 0, 0, coneH + neckH / 2);
  const rim = torus(neckR, wall * 0.9, assetMaterials.glass, 6, 24);
  placeAt(rim, 0, 0, coneH + neckH);
  const liquidH = coneH * 0.45;
  const liquid = vcyl(rBody * 0.55, rBody * 0.92, liquidH, assetMaterials.liquid_yellow, 32);
  placeAt(liquid, 0, 0, wall + liquidH / 2);
  g.add(cone, base, neck, rim, liquid);
  return g;
}

function buildRoundFlask(spec) {
  const g = new THREE.Group();
  const rBody = Number(spec.radius_m) || 0.04;
  const neckR = rBody * 0.32;
  const neckH = rBody * 1.3;
  const sphere = sph(rBody, assetMaterials.glass, 28, 20);
  placeAt(sphere, 0, 0, rBody);
  const neck = vcyl(neckR, neckR, neckH, assetMaterials.glass, 24, true);
  placeAt(neck, 0, 0, rBody * 2 + neckH / 2 - rBody * 0.25);
  const rim = torus(neckR, rBody * 0.025, assetMaterials.glass, 6, 24);
  placeAt(rim, 0, 0, rBody * 2 + neckH - rBody * 0.25);
  const liquid = sph(rBody * 0.78, assetMaterials.liquid_yellow, 22, 14);
  placeAt(liquid, 0, 0, rBody * 0.85);
  g.add(sphere, neck, rim, liquid);
  return g;
}

function buildGraduatedCylinder(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.014;
  const h = Number(spec.height_m) || 0.215;
  const baseR = r * 1.85;
  const baseH = h * 0.04;
  const tubeH = h - baseH;
  const wall = r * 0.05;
  const base = vcyl(baseR, baseR * 1.05, baseH, assetMaterials.glass, 28);
  placeAt(base, 0, 0, baseH / 2);
  const tube = vcyl(r, r, tubeH, assetMaterials.glass, 28, true);
  placeAt(tube, 0, 0, baseH + tubeH / 2);
  const rim = torus(r, wall, assetMaterials.glass, 6, 26);
  placeAt(rim, 0, 0, baseH + tubeH);
  const spout = bx(r * 0.4, r * 0.7, h * 0.025, assetMaterials.glass);
  placeAt(spout, r * 0.95, 0, baseH + tubeH - h * 0.012);
  spout.rotation.z = Math.PI / 6;
  for (let i = 1; i <= 9; i++) {
    const tick = bx(r * 0.55, r * 0.02, h * 0.003, assetMaterials.paper_white);
    placeAt(tick, r * 0.92, 0, baseH + tubeH * (i / 10));
    g.add(tick);
  }
  const liquidH = tubeH * 0.55;
  const liquid = vcyl(r * 0.92, r * 0.92, liquidH, assetMaterials.liquid_blue, 26);
  placeAt(liquid, 0, 0, baseH + liquidH / 2);
  g.add(base, tube, rim, spout, liquid);
  return g;
}

function buildPetri(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.045;
  const h = Number(spec.height_m) || 0.015;
  const dishH = h * 0.55;
  const lidH = h * 0.55;
  const wall = r * 0.025;
  const dish = vcyl(r, r, dishH, assetMaterials.glass, 32, true);
  placeAt(dish, 0, 0, dishH / 2);
  const dishBase = disk(r, wall, assetMaterials.glass, 32);
  placeAt(dishBase, 0, 0, wall / 2);
  const lid = vcyl(r * 1.04, r * 1.04, lidH, assetMaterials.glass, 32, true);
  placeAt(lid, 0, 0, dishH + lidH / 2);
  const lidTop = disk(r * 1.04, wall, assetMaterials.glass, 32);
  placeAt(lidTop, 0, 0, dishH + lidH - wall / 2);
  const medium = disk(r * 0.94, dishH * 0.5, assetMaterials.liquid_yellow, 32);
  placeAt(medium, 0, 0, wall + dishH * 0.25);
  g.add(dish, dishBase, lid, lidTop, medium);
  return g;
}

function buildPipette(spec) {
  const g = new THREE.Group();
  const rTip = Number(spec.radius_m) || 0.005;
  const totalH = Number(spec.height_m) || 0.22;
  const bulbR = rTip * 2.6;
  const tipH = totalH * 0.55;
  const shaftH = totalH * 0.32;
  const tip = vcyl(rTip * 0.15, rTip, tipH, assetMaterials.glass, 18);
  placeAt(tip, 0, 0, tipH / 2);
  const shaft = vcyl(rTip * 1.05, rTip * 1.05, shaftH, assetMaterials.glass, 18, true);
  placeAt(shaft, 0, 0, tipH + shaftH / 2);
  const bulb = sph(bulbR, assetMaterials.rubber, 18, 12);
  placeAt(bulb, 0, 0, tipH + shaftH + bulbR * 0.85);
  bulb.scale.set(1, 1, 1.25);
  g.add(tip, shaft, bulb);
  return g;
}

function buildBurette(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.012;
  const totalH = Number(spec.height_m) || 0.55;
  const tipLen = totalH * 0.07;
  const stopcockH = totalH * 0.06;
  const tubeH = totalH - tipLen - stopcockH;
  const wall = r * 0.08;
  const tip = vcyl(r * 0.18, r * 0.45, tipLen, assetMaterials.glass, 18);
  placeAt(tip, 0, 0, tipLen / 2);
  const stopcockBody = vcyl(r * 1.15, r * 1.15, stopcockH, assetMaterials.glass, 22);
  placeAt(stopcockBody, 0, 0, tipLen + stopcockH / 2);
  const valveAxle = hcyl(r * 0.32, r * 0.32, r * 3.2, assetMaterials.brass, "x", 12);
  placeAt(valveAxle, 0, 0, tipLen + stopcockH / 2);
  const knobL = bx(r * 0.45, r * 1.2, r * 0.45, assetMaterials.cap_white);
  placeAt(knobL, -r * 1.7, 0, tipLen + stopcockH / 2);
  const knobR = bx(r * 0.45, r * 1.2, r * 0.45, assetMaterials.cap_white);
  placeAt(knobR, r * 1.7, 0, tipLen + stopcockH / 2);
  const tube = vcyl(r, r, tubeH, assetMaterials.glass, 24, true);
  placeAt(tube, 0, 0, tipLen + stopcockH + tubeH / 2);
  const rim = torus(r * 1.1, wall, assetMaterials.glass, 6, 22);
  placeAt(rim, 0, 0, totalH);
  for (let i = 1; i < 10; i++) {
    const tick = bx(r * 0.45, r * 0.015, totalH * 0.004, assetMaterials.paper_white);
    placeAt(tick, r * 0.92, 0, tipLen + stopcockH + tubeH * (i / 10));
    g.add(tick);
  }
  const liquidH = tubeH * 0.7;
  const liquid = vcyl(r * 0.92, r * 0.92, liquidH, assetMaterials.liquid_blue, 22);
  placeAt(liquid, 0, 0, tipLen + stopcockH + liquidH / 2);
  g.add(tip, stopcockBody, valveAxle, knobL, knobR, tube, rim, liquid);
  return g;
}

function buildReagentBottle(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.035;
  const h = Number(spec.height_m) || 0.13;
  const shoulderH = h * 0.14;
  const neckH = h * 0.09;
  const capH = h * 0.11;
  const bodyH = h - shoulderH - neckH - capH;
  const neckR = r * 0.42;
  const body = vcyl(r, r, bodyH, assetMaterials.glass_amber, 28);
  placeAt(body, 0, 0, bodyH / 2);
  const shoulder = vcyl(neckR, r, shoulderH, assetMaterials.glass_amber, 28);
  placeAt(shoulder, 0, 0, bodyH + shoulderH / 2);
  const neck = vcyl(neckR, neckR, neckH, assetMaterials.glass_amber, 24);
  placeAt(neck, 0, 0, bodyH + shoulderH + neckH / 2);
  const cap = vcyl(neckR * 1.18, neckR * 1.18, capH, assetMaterials.cap_red, 24);
  placeAt(cap, 0, 0, bodyH + shoulderH + neckH + capH / 2);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rib = bx(r * 0.04, r * 0.04, capH * 0.85, assetMaterials.cap_red);
    placeAt(rib, Math.cos(a) * neckR * 1.18, Math.sin(a) * neckR * 1.18, bodyH + shoulderH + neckH + capH / 2);
    g.add(rib);
  }
  const label = bx(r * 1.55, r * 0.04, bodyH * 0.55, assetMaterials.paper_white);
  placeAt(label, 0, r * 0.99, bodyH * 0.45);
  label.rotation.x = 0;
  g.add(body, shoulder, neck, cap, label);
  return g;
}

function buildCentrifugeTube(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.0085;
  const totalH = Number(spec.height_m) || 0.118;
  const coneH = r * 1.6;
  const capH = totalH * 0.1;
  const bodyH = totalH - coneH - capH;
  const cone = vcyl(r, r * 0.05, coneH, assetMaterials.glass, 20);
  placeAt(cone, 0, 0, coneH / 2);
  const body = vcyl(r, r, bodyH, assetMaterials.glass, 24);
  placeAt(body, 0, 0, coneH + bodyH / 2);
  const cap = vcyl(r * 1.12, r * 1.05, capH, assetMaterials.cap_blue, 22);
  placeAt(cap, 0, 0, coneH + bodyH + capH / 2);
  const flange = vcyl(r * 1.35, r * 1.35, capH * 0.35, assetMaterials.cap_blue, 22);
  placeAt(flange, 0, 0, coneH + bodyH + capH * 0.18);
  for (let i = 1; i < 8; i++) {
    const tick = bx(r * 0.6, r * 0.02, bodyH * 0.006, assetMaterials.paper_white);
    placeAt(tick, r * 0.9, 0, coneH + bodyH * (i / 8));
    g.add(tick);
  }
  g.add(cone, body, cap, flange);
  return g;
}

function buildVialRack(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.12, 0.09, 0.035];
  const [w, d, h] = [dims[0] || 0.12, dims[1] || 0.09, dims[2] || 0.035];
  const base = bx(w, d, h * 0.4, assetMaterials.plastic_white);
  placeAt(base, 0, 0, h * 0.2);
  const top = bx(w, d, h * 0.6, assetMaterials.plastic_white);
  placeAt(top, 0, 0, h * 0.7);
  g.add(base, top);
  const cols = 4;
  const rows = 3;
  const cellW = w / (cols + 1);
  const cellD = d / (rows + 1);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -w / 2 + cellW * (c + 1);
      const y = -d / 2 + cellD * (r + 1);
      const hole = vcyl(cellW * 0.32, cellW * 0.32, h * 0.62, assetMaterials.panel_dark, 14);
      placeAt(hole, x, y, h * 0.7);
      g.add(hole);
    }
  }
  return g;
}

function buildTubeRack(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.18, 0.06, 0.05];
  const [w, d, h] = [dims[0] || 0.18, dims[1] || 0.06, dims[2] || 0.05];
  const base = bx(w, d, h * 0.3, assetMaterials.plastic_white);
  placeAt(base, 0, 0, h * 0.15);
  const top = bx(w, d * 0.95, h * 0.18, assetMaterials.plastic_white);
  placeAt(top, 0, 0, h * 0.4);
  const slots = 6;
  const cellW = w / (slots + 1);
  for (let i = 0; i < slots; i++) {
    const x = -w / 2 + cellW * (i + 1);
    const hole = vcyl(cellW * 0.36, cellW * 0.36, h * 0.16, assetMaterials.panel_dark, 14);
    placeAt(hole, x, 0, h * 0.4);
    g.add(hole);
    const post = bx(cellW * 0.18, d * 1.05, h * 1.1, assetMaterials.plastic_white);
    placeAt(post, x, 0, h * 0.55);
    g.add(post);
  }
  g.add(base, top);
  return g;
}

function buildTray(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.3, 0.2, 0.025];
  const [w, d, h] = [dims[0] || 0.3, dims[1] || 0.2, dims[2] || 0.025];
  const wall = h * 0.18;
  const base = bx(w, d, h * 0.35, assetMaterials.plastic_white);
  placeAt(base, 0, 0, h * 0.175);
  const lipFront = bx(w, wall, h * 0.65, assetMaterials.plastic_white);
  placeAt(lipFront, 0, -d / 2 + wall / 2, h * 0.5);
  const lipBack = bx(w, wall, h * 0.65, assetMaterials.plastic_white);
  placeAt(lipBack, 0, d / 2 - wall / 2, h * 0.5);
  const lipLeft = bx(wall, d - wall * 2, h * 0.65, assetMaterials.plastic_white);
  placeAt(lipLeft, -w / 2 + wall / 2, 0, h * 0.5);
  const lipRight = bx(wall, d - wall * 2, h * 0.65, assetMaterials.plastic_white);
  placeAt(lipRight, w / 2 - wall / 2, 0, h * 0.5);
  g.add(base, lipFront, lipBack, lipLeft, lipRight);
  return g;
}

function buildWellPlate(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.127, 0.085, 0.015];
  const [w, d, h] = [dims[0] || 0.127, dims[1] || 0.085, dims[2] || 0.015];
  const base = bx(w, d, h, assetMaterials.plastic_white);
  placeAt(base, 0, 0, h / 2);
  g.add(base);
  const cols = 12;
  const rows = 8;
  const cellW = w / (cols + 1);
  const cellD = d / (rows + 1);
  const wellR = Math.min(cellW, cellD) * 0.36;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const x = -w / 2 + cellW * (c + 1);
      const y = -d / 2 + cellD * (r + 1);
      const well = vcyl(wellR, wellR, h * 0.75, assetMaterials.panel_dark, 10);
      placeAt(well, x, y, h * 0.65);
      g.add(well);
    }
  }
  return g;
}

function buildHotPlate(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.18, 0.18, 0.1];
  const [w, d, h] = [dims[0] || 0.18, dims[1] || 0.18, dims[2] || 0.1];
  const body = bx(w, d, h * 0.65, assetMaterials.panel);
  placeAt(body, 0, 0, h * 0.325);
  const plate = vcyl(Math.min(w, d) * 0.42, Math.min(w, d) * 0.42, h * 0.04, assetMaterials.ceramic, 32);
  placeAt(plate, 0, d * 0.08, h * 0.65 + h * 0.02);
  const ring = torus(Math.min(w, d) * 0.42, h * 0.01, assetMaterials.steel_dark, 8, 32);
  placeAt(ring, 0, d * 0.08, h * 0.65 + h * 0.025);
  const display = bx(w * 0.55, d * 0.04, h * 0.18, assetMaterials.screen);
  placeAt(display, 0, -d / 2 + d * 0.02, h * 0.35);
  const dialTemp = vcyl(w * 0.08, w * 0.08, h * 0.06, assetMaterials.cap_white, 18);
  placeAt(dialTemp, -w * 0.26, -d / 2 + d * 0.02, h * 0.55);
  const dialStir = vcyl(w * 0.08, w * 0.08, h * 0.06, assetMaterials.cap_white, 18);
  placeAt(dialStir, w * 0.26, -d / 2 + d * 0.02, h * 0.55);
  const led = sph(w * 0.012, assetMaterials.led_red, 10, 8);
  placeAt(led, w * 0.4, -d / 2 + d * 0.02, h * 0.61);
  g.add(body, plate, ring, display, dialTemp, dialStir, led);
  return g;
}

function buildBalance(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.22, 0.32, 0.12];
  const [w, d, h] = [dims[0] || 0.22, dims[1] || 0.32, dims[2] || 0.12];
  const base = bx(w, d, h * 0.45, assetMaterials.panel);
  placeAt(base, 0, 0, h * 0.225);
  const backWall = bx(w, d * 0.08, h * 0.55, assetMaterials.panel);
  placeAt(backWall, 0, d * 0.42, h * 0.45 + h * 0.275);
  const display = bx(w * 0.75, d * 0.02, h * 0.32, assetMaterials.screen);
  placeAt(display, 0, d * 0.38, h * 0.45 + h * 0.32);
  const pan = vcyl(Math.min(w, d) * 0.32, Math.min(w, d) * 0.32, h * 0.02, assetMaterials.steel, 32);
  placeAt(pan, 0, -d * 0.04, h * 0.45 + h * 0.02);
  const post = vcyl(w * 0.04, w * 0.04, h * 0.08, assetMaterials.steel_dark, 14);
  placeAt(post, 0, -d * 0.04, h * 0.45 - h * 0.04);
  for (let i = 0; i < 4; i++) {
    const btn = bx(w * 0.12, d * 0.04, h * 0.04, assetMaterials.plastic_dark);
    placeAt(btn, -w * 0.32 + i * w * 0.21, d * 0.24, h * 0.45 + h * 0.022);
    g.add(btn);
  }
  g.add(base, backWall, display, pan, post);
  return g;
}

function buildPhMeter(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.12, 0.18, 0.06];
  const [w, d, h] = [dims[0] || 0.12, dims[1] || 0.18, dims[2] || 0.06];
  const body = bx(w, d, h, assetMaterials.panel);
  placeAt(body, 0, 0, h / 2);
  const display = bx(w * 0.78, d * 0.4, h * 0.04, assetMaterials.screen);
  placeAt(display, 0, d * 0.15, h + 0.002);
  display.rotation.x = -Math.PI / 8;
  const probeHolder = vcyl(w * 0.06, w * 0.06, h * 1.6, assetMaterials.steel, 14);
  placeAt(probeHolder, w * 0.55, d * 0.3, h * 0.8);
  const probe = vcyl(w * 0.04, w * 0.04, h * 1.4, assetMaterials.glass, 14, true);
  placeAt(probe, w * 0.55, d * 0.3, h * 0.7);
  for (let i = 0; i < 6; i++) {
    const btn = bx(w * 0.14, d * 0.08, h * 0.05, assetMaterials.plastic_dark);
    placeAt(btn, -w * 0.32 + (i % 3) * w * 0.32, -d * 0.05 - Math.floor(i / 3) * d * 0.12, h + 0.002);
    g.add(btn);
  }
  g.add(body, display, probeHolder, probe);
  return g;
}

function buildCentrifuge(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.28, 0.28, 0.22];
  const [w, d, h] = [dims[0] || 0.28, dims[1] || 0.28, dims[2] || 0.22];
  const body = bx(w, d, h * 0.7, assetMaterials.panel);
  placeAt(body, 0, 0, h * 0.35);
  const lid = vcyl(Math.min(w, d) * 0.48, Math.min(w, d) * 0.48, h * 0.18, assetMaterials.panel, 32);
  placeAt(lid, 0, 0, h * 0.7 + h * 0.09);
  const lidTop = disk(Math.min(w, d) * 0.48, h * 0.005, assetMaterials.panel, 32);
  placeAt(lidTop, 0, 0, h * 0.7 + h * 0.18);
  const display = bx(w * 0.5, d * 0.04, h * 0.12, assetMaterials.screen);
  placeAt(display, 0, -d / 2 + 0.002, h * 0.4);
  const button1 = bx(w * 0.12, d * 0.04, h * 0.05, assetMaterials.plastic_dark);
  placeAt(button1, -w * 0.25, -d / 2 + 0.002, h * 0.2);
  const button2 = bx(w * 0.12, d * 0.04, h * 0.05, assetMaterials.plastic_dark);
  placeAt(button2, w * 0.25, -d / 2 + 0.002, h * 0.2);
  const handle = bx(w * 0.2, d * 0.05, h * 0.04, assetMaterials.steel_dark);
  placeAt(handle, 0, d * 0.1, h * 0.7 + h * 0.18);
  const led = sph(w * 0.012, assetMaterials.led_green, 10, 8);
  placeAt(led, w * 0.32, -d / 2 + 0.002, h * 0.5);
  g.add(body, lid, lidTop, display, button1, button2, handle, led);
  return g;
}

function buildVortex(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.12, 0.14, 0.13];
  const [w, d, h] = [dims[0] || 0.12, dims[1] || 0.14, dims[2] || 0.13];
  const body = bx(w, d, h * 0.7, assetMaterials.panel);
  placeAt(body, 0, 0, h * 0.35);
  const platform = vcyl(Math.min(w, d) * 0.4, Math.min(w, d) * 0.4, h * 0.05, assetMaterials.rubber, 28);
  placeAt(platform, 0, 0, h * 0.7 + h * 0.025);
  const cup = vcyl(Math.min(w, d) * 0.18, Math.min(w, d) * 0.18, h * 0.08, assetMaterials.rubber, 20, true);
  placeAt(cup, 0, 0, h * 0.7 + h * 0.09);
  const dial = vcyl(w * 0.13, w * 0.13, h * 0.05, assetMaterials.cap_white, 18);
  placeAt(dial, -w * 0.28, -d / 2 + 0.002, h * 0.35);
  const switchBtn = bx(w * 0.16, d * 0.04, h * 0.06, assetMaterials.plastic_dark);
  placeAt(switchBtn, w * 0.28, -d / 2 + 0.002, h * 0.35);
  g.add(body, platform, cup, dial, switchBtn);
  return g;
}

function buildStirBar(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.003;
  const len = Number(spec.height_m) || 0.025;
  const body = hcyl(r, r, len - r * 2, assetMaterials.plastic_white, "x", 18);
  placeAt(body, 0, 0, r);
  const capL = sph(r, assetMaterials.plastic_white, 14, 10);
  placeAt(capL, -(len - r * 2) / 2, 0, r);
  const capR = sph(r, assetMaterials.plastic_white, 14, 10);
  placeAt(capR, (len - r * 2) / 2, 0, r);
  g.add(body, capL, capR);
  return g;
}

function buildRingStand(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.16, 0.1, 0.6];
  const [w, d, totalH] = [dims[0] || 0.16, dims[1] || 0.1, dims[2] || 0.6];
  const baseH = totalH * 0.025;
  const rodR = w * 0.04;
  const base = bx(w, d, baseH, assetMaterials.steel_dark);
  placeAt(base, 0, 0, baseH / 2);
  const rod = vcyl(rodR, rodR, totalH - baseH, assetMaterials.steel, 16);
  placeAt(rod, -w * 0.35, 0, baseH + (totalH - baseH) / 2);
  const clampBoss = bx(w * 0.18, d * 0.4, totalH * 0.04, assetMaterials.steel_dark);
  placeAt(clampBoss, -w * 0.25, 0, totalH * 0.55);
  const clampArm = hcyl(rodR * 0.85, rodR * 0.85, w * 0.65, assetMaterials.steel, "x", 14);
  placeAt(clampArm, w * 0.05, 0, totalH * 0.55);
  const clampScrew = vcyl(rodR * 0.6, rodR * 0.6, totalH * 0.06, assetMaterials.steel_dark, 14);
  placeAt(clampScrew, -w * 0.25, d * 0.3, totalH * 0.55);
  clampScrew.rotation.x = Math.PI / 2;
  const ringR = w * 0.32;
  const ring = torus(ringR, rodR * 0.5, assetMaterials.steel_dark, 8, 24);
  placeAt(ring, w * 0.32, 0, totalH * 0.55);
  ring.rotation.x = Math.PI / 2;
  g.add(base, rod, clampBoss, clampArm, clampScrew, ring);
  return g;
}

function buildBench(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.6, 0.4, 0.02];
  const [w, d, h] = [dims[0] || 0.6, dims[1] || 0.4, dims[2] || 0.02];
  const top = bx(w, d, h, assetMaterials.wood);
  placeAt(top, 0, 0, h / 2);
  const edge = bx(w + 0.004, d + 0.004, h * 0.2, assetMaterials.panel_dark);
  placeAt(edge, 0, 0, h - h * 0.1);
  g.add(top, edge);
  return g;
}

function buildShelf(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.5, 0.18, 0.02];
  const [w, d, h] = [dims[0] || 0.5, dims[1] || 0.18, dims[2] || 0.02];
  const top = bx(w, d, h, assetMaterials.plastic_white);
  placeAt(top, 0, 0, h / 2);
  const bracketL = bx(w * 0.04, d, h * 4, assetMaterials.steel_dark);
  placeAt(bracketL, -w / 2 + w * 0.02, 0, -h * 2 + h / 2);
  const bracketR = bx(w * 0.04, d, h * 4, assetMaterials.steel_dark);
  placeAt(bracketR, w / 2 - w * 0.02, 0, -h * 2 + h / 2);
  g.add(top, bracketL, bracketR);
  return g;
}

function buildFumeWall(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.6, 0.02, 0.5];
  const [w, d, h] = [dims[0] || 0.6, dims[1] || 0.02, dims[2] || 0.5];
  const wall = bx(w, d, h, assetMaterials.glass);
  placeAt(wall, 0, 0, h / 2);
  const frame = bx(w + 0.01, d * 2, h * 0.05, assetMaterials.panel_dark);
  placeAt(frame, 0, 0, h * 0.025);
  const top = bx(w + 0.01, d * 2, h * 0.05, assetMaterials.panel_dark);
  placeAt(top, 0, 0, h - h * 0.025);
  g.add(wall, frame, top);
  return g;
}

function buildWeighBoat(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.05, 0.05, 0.005];
  const [w, d, h] = [dims[0] || 0.05, dims[1] || 0.05, dims[2] || 0.005];
  const base = bx(w, d, h * 0.3, assetMaterials.paper_white);
  placeAt(base, 0, 0, h * 0.15);
  const wall = h * 0.4;
  const lips = [
    { w, d: wall, x: 0, y: -d / 2 + wall / 2 },
    { w, d: wall, x: 0, y: d / 2 - wall / 2 },
    { w: wall, d: d - wall * 2, x: -w / 2 + wall / 2, y: 0 },
    { w: wall, d: d - wall * 2, x: w / 2 - wall / 2, y: 0 }
  ];
  for (const lip of lips) {
    const m = bx(lip.w, lip.d, h * 0.9, assetMaterials.paper_white);
    placeAt(m, lip.x, lip.y, h * 0.6);
    m.rotation.x = lip.y > 0 ? -0.15 : lip.y < 0 ? 0.15 : 0;
    m.rotation.y = lip.x > 0 ? 0.15 : lip.x < 0 ? -0.15 : 0;
    g.add(m);
  }
  g.add(base);
  return g;
}

function buildSpatula(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.12, 0.01, 0.005];
  const [w, d, h] = [dims[0] || 0.12, dims[1] || 0.01, dims[2] || 0.005];
  const handle = hcyl(h * 0.7, h * 0.7, w * 0.68, assetMaterials.steel, "x", 14);
  placeAt(handle, -w * 0.16, 0, h * 0.7);
  const scoopL = bx(w * 0.22, d * 1.6, h * 0.4, assetMaterials.steel);
  placeAt(scoopL, w * 0.32, 0, h * 0.4);
  const scoopR = bx(w * 0.22, d * 1.6, h * 0.4, assetMaterials.steel);
  placeAt(scoopR, -w * 0.5, 0, h * 0.4);
  g.add(handle, scoopL, scoopR);
  return g;
}

function buildPrimitiveCylinder(spec) {
  const g = new THREE.Group();
  const r = Number(spec.radius_m) || 0.025;
  const h = Number(spec.height_m) || 0.05;
  const mesh = vcyl(r, r, h, materials.rigid_body, 24);
  placeAt(mesh, 0, 0, h / 2);
  g.add(mesh);
  return g;
}

function buildPrimitiveBox(spec) {
  const g = new THREE.Group();
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.05, 0.05, 0.05];
  const [w, d, h] = [dims[0] || 0.05, dims[1] || 0.05, dims[2] || 0.05];
  const mesh = bx(w, d, h, materials.rigid_body);
  placeAt(mesh, 0, 0, h / 2);
  g.add(mesh);
  return g;
}

const ASSET_BUILDERS = {
  vial_1_5ml: buildVialSmall,
  vial_4ml: (spec) => buildVialScrewCap(spec, assetMaterials.cap_blue),
  test_tube: buildTestTube,
  beaker_50: buildBeaker,
  beaker_250: buildBeaker,
  erlenmeyer_250: buildErlenmeyer,
  round_flask_250: buildRoundFlask,
  graduated_cyl_100: buildGraduatedCylinder,
  petri: buildPetri,
  pipette: buildPipette,
  burette: buildBurette,
  reagent_bottle: buildReagentBottle,
  centrifuge_tube_15: buildCentrifugeTube,
  vial_rack: buildVialRack,
  tube_rack: buildTubeRack,
  tray: buildTray,
  well_plate_96: buildWellPlate,
  hot_plate: buildHotPlate,
  balance: buildBalance,
  ph_meter: buildPhMeter,
  centrifuge: buildCentrifuge,
  vortex: buildVortex,
  stir_bar: buildStirBar,
  ring_stand: buildRingStand,
  bench: buildBench,
  shelf: buildShelf,
  fume_wall: buildFumeWall,
  weigh_boat: buildWeighBoat,
  spatula: buildSpatula,
  cylinder: buildPrimitiveCylinder,
  box: buildPrimitiveBox,
  plate: buildPrimitiveBox
};

function makeRigidBody(entity) {
  const spec = entitySpec(entity);
  const assetId = typeof spec.asset === "string" ? spec.asset : "";
  const builder = ASSET_BUILDERS[assetId];
  if (builder) return builder(spec);
  if (spec.collision_shape === "cylinder") return buildPrimitiveCylinder(spec);
  return buildPrimitiveBox(spec);
}

function buildEntity(entity, armAsset) {
  const kind = String(entity.kind);
  if (kind === "arm") {
    if (!armAsset) throw new Error("SO-101 asset is required for virtual arm rendering.");
    return buildRobotModel(armAsset);
  }
  if (kind === "camera") return makeCamera(entity);
  if (kind === "light") return makeLight(entity);
  return makeRigidBody(entity);
}

function clearSceneObjects() {
  for (const [, group] of objects) scene.remove(group);
  objects.clear();
  pickables.length = 0;
  translateTransform.detach();
  rotateTransform.detach();
}

async function rebuild(state) {
  const sequence = ++rebuildSequence;
  entities = Array.isArray(state.entities) ? state.entities : [];
  selectedId = String(state.selectedId || "");
  if (state.transformMode === "rotate" || state.transformMode === "translate") {
    setTransformMode(state.transformMode);
  }
  const hasArm = entities.some((entity) => String(entity.kind) === "arm");
  let armAsset = null;
  if (hasArm) {
    try {
      armAsset = await loadRobotAsset();
    } catch (error) {
      console.error("Virtual world SO-101 asset load failed.", error);
      showDropStatus("SO-101 mesh load failed", true);
      clearSceneObjects();
      return;
    }
  }
  if (sequence !== rebuildSequence) return;
  clearSceneObjects();
  for (const entity of entities) {
    const id = String(entity.id);
    const group = buildEntity(entity, armAsset);
    group.userData.entity = entity;
    group.userData.entityId = id;
    setGroupPose(group, entity);
    scene.add(group);
    objects.set(id, group);
    group.traverse((node) => {
      if (node.isMesh) {
        node.userData.entityId = id;
        if (!node.userData.originalMaterial) node.userData.originalMaterial = node.material;
        pickables.push(node);
        if (!node.userData.isCameraHitbox) {
          node.castShadow = true;
          node.receiveShadow = true;
        }
      }
    });
  }
  attachSelected();
  settleRigidBodies(true);
  updateCollisions();
}

function attachSelected() {
  const group = objects.get(selectedId);
  if (group) {
    translateTransform.attach(group);
    rotateTransform.attach(group);
    setTransformMode(transformMode);
  } else {
    translateTransform.detach();
    rotateTransform.detach();
  }
}

function collidable(entity) {
  const kind = String(entity.kind);
  return entity.collision_enabled === true && (kind === "arm" || kind === "rigid_body");
}

function rigidBodyEntity(entity) {
  return String(entity.kind) === "rigid_body" && entity.collision_enabled === true;
}

function boxesOverlapXY(a, b) {
  return a.max.x > b.min.x && a.min.x < b.max.x && a.max.y > b.min.y && a.min.y < b.max.y;
}

function poseFromGroup(entity, group) {
  return {
    ...entityPose(entity),
    x: group.position.x,
    y: group.position.y,
    z: group.position.z,
    roll: THREE.MathUtils.radToDeg(group.rotation.x),
    pitch: THREE.MathUtils.radToDeg(group.rotation.y),
    yaw: THREE.MathUtils.radToDeg(group.rotation.z)
  };
}

function persistGroupPose(id, group) {
  const entity = entities.find((item) => String(item.id) === id);
  if (!entity) return;
  void editorApi()?.updateEntityPose?.(id, poseFromGroup(entity, group));
}

function supportZFor(id, box) {
  let support = FLOOR_Z;
  for (const entity of entities) {
    const otherId = String(entity.id);
    if (otherId === id || !rigidBodyEntity(entity)) continue;
    const other = objects.get(otherId);
    if (!other) continue;
    const otherBox = boxFromObjectWithoutSelectionOutline(other);
    if (!boxesOverlapXY(box, otherBox)) continue;
    if (otherBox.max.z <= box.max.z - CONTACT_EPSILON_M) {
      support = Math.max(support, otherBox.max.z);
    }
  }
  return support;
}

function settleRigidBodies(markDirty = true) {
  let changed = false;
  const rigidEntities = entities.filter(rigidBodyEntity);
  for (let pass = 0; pass < Math.max(1, rigidEntities.length); pass += 1) {
    let passChanged = false;
    for (const entity of rigidEntities) {
      const id = String(entity.id);
      const group = objects.get(id);
      if (!group) continue;
      const box = boxFromObjectWithoutSelectionOutline(group);
      const support = supportZFor(id, box);
      const delta = box.min.z - support;
      if (Math.abs(delta) <= CONTACT_EPSILON_M) continue;
      if (delta > 0) {
        const fall = Math.min(GRAVITY_M_PER_FRAME, delta);
        group.position.z -= fall;
        if (!draggingTransform) {
          group.rotation.x += 0.012 * Math.min(1, delta / GRAVITY_M_PER_FRAME);
          group.rotation.y += 0.008 * Math.min(1, delta / GRAVITY_M_PER_FRAME);
        }
      } else {
        group.position.z -= delta;
      }
      if (markDirty) physicsDirtyIds.add(id);
      lastPhysicsChangeMs = performance.now();
      passChanged = true;
      changed = true;
    }
    if (!passChanged) break;
  }
  if (changed) updateCollisions();
  return changed;
}

function persistPhysicsIfNeeded(now, force = false) {
  if (draggingTransform || physicsDirtyIds.size === 0) return;
  if (!force && (now - lastPhysicsChangeMs < PHYSICS_PERSIST_SETTLE_MS || now - lastPhysicsPersistMs < PHYSICS_PERSIST_INTERVAL_MS)) return;
  const ids = Array.from(physicsDirtyIds);
  physicsDirtyIds.clear();
  lastPhysicsPersistMs = now;
  for (const id of ids) {
    const group = objects.get(id);
    if (group) persistGroupPose(id, group);
  }
}

function collisionPairs() {
  const groups = entities
    .filter(collidable)
    .map((entity) => ({ entity, group: objects.get(String(entity.id)), box: new THREE.Box3() }))
    .filter((item) => item.group);
  for (const item of groups) withSelectionOutlinesHidden(() => item.box.setFromObject(item.group));
  const collisions = new Set();
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = groups[i];
      const b = groups[j];
      const kinds = new Set([String(a.entity.kind), String(b.entity.kind)]);
      if (!kinds.has("arm") && !(kinds.size === 1 && kinds.has("rigid_body"))) continue;
      if (a.box.intersectsBox(b.box)) {
        collisions.add(String(a.entity.id));
        collisions.add(String(b.entity.id));
      }
    }
  }
  return collisions;
}

function updateCollisions() {
  const collisions = collisionPairs();
  for (const entity of entities) {
    const id = String(entity.id);
    const group = objects.get(id);
    if (!group) continue;
    const isCollision = collisions.has(id);
    const isSelected = id === selectedId;
    setSelectionOutline(group, isSelected);
    if (group.userData.recolorWire) {
      const wireOverride = isCollision ? 0xff4f4f : isSelected ? SELECTED_OUTLINE_COLOR : undefined;
      group.userData.recolorWire(wireOverride);
    } else if (isCollision) {
      applyMaterial(group, materials.collision);
    } else if (isSelected) {
      applyMaterial(group, String(entity.kind) === "rigid_body" ? null : materials.selected);
    } else if (String(entity.kind) === "rigid_body") {
      applyMaterial(group, null);
    } else {
      applyMaterial(group, materials[String(entity.kind)] || materials.rigid_body);
    }
  }
  if (banner) banner.hidden = collisions.size === 0;
}

function pointerToGround(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  raycaster.ray.intersectPlane(ground, dropPoint);
  return dropPoint;
}

function sceneContainsPoint(event) {
  const rect = root.getBoundingClientRect();
  return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
}

function showDropStatus(message, error = false) {
  if (!dropStatus) return;
  window.clearTimeout(dropStatusTimer);
  dropStatus.textContent = message;
  dropStatus.classList.toggle("error", error);
  dropStatus.hidden = false;
  dropStatusTimer = window.setTimeout(() => {
    dropStatus.hidden = true;
    dropStatus.classList.remove("error");
  }, 1800);
}

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (draggingTransform || transformControlHasPointer()) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (!hit) {
    backgroundClick = { x: event.clientX, y: event.clientY };
    return;
  }
  backgroundClick = null;
  const id = hit.object.userData.entityId;
  if (id && editorApi()?.selectEntity) editorApi().selectEntity(String(id));
});

renderer.domElement.addEventListener("pointerup", (event) => {
  if (!backgroundClick || draggingTransform || transformControlHasPointer()) {
    backgroundClick = null;
    return;
  }
  const dx = event.clientX - backgroundClick.x;
  const dy = event.clientY - backgroundClick.y;
  backgroundClick = null;
  if (Math.hypot(dx, dy) > 4) return;
  editorApi()?.selectEntity?.("");
});

function dragKind(event) {
  const kind = event.dataTransfer?.getData("application/x-chem0-asset") || event.dataTransfer?.getData("text/plain") || "";
  return /^[a-z0-9_]+$/i.test(kind) ? kind : "";
}

function validKind(kind) {
  return /^[a-z0-9_]+$/i.test(kind) ? kind : "";
}

function handleDragOver(event) {
  if (!sceneContainsPoint(event)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

async function handleDrop(event) {
  if (!sceneContainsPoint(event)) return;
  event.preventDefault();
  event.stopPropagation();
  const kind = dragKind(event);
  if (!kind) {
    showDropStatus("Drop missing toolbox asset", true);
    console.error("Virtual world drop ignored: DataTransfer did not include a valid asset kind.");
    return;
  }
  const point = pointerToGround(event);
  try {
    showDropStatus(`Adding ${kind}`);
    await editorApi()?.createEntity?.(kind, { x: point.x, y: point.y, z: kind === "camera" ? 0.4 : kind === "light" ? 0.6 : 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showDropStatus(`Add failed: ${message}`, true);
    console.error("Virtual world asset creation failed.", error);
  }
}

document.addEventListener("dragover", handleDragOver, true);
document.addEventListener("drop", (event) => void handleDrop(event), true);

window.addEventListener("vw:create-at-point", (event) => {
  const detail = event.detail || {};
  const kind = validKind(String(detail.kind || ""));
  const clientX = Number(detail.clientX);
  const clientY = Number(detail.clientY);
  if (!kind || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
    showDropStatus("Invalid toolbox placement", true);
    console.error("Virtual world placement ignored: invalid toolbox placement event.", detail);
    return;
  }
  const point = pointerToGround({ clientX, clientY });
  showDropStatus(`Adding ${kind}`);
  void editorApi()?.createEntity?.(kind, { x: point.x, y: point.y, z: kind === "camera" ? 0.4 : kind === "light" ? 0.6 : 0 }).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    showDropStatus(`Add failed: ${message}`, true);
    console.error("Virtual world asset creation failed.", error);
  });
});

installTransformEvents(translateTransform);
installTransformEvents(rotateTransform);

function runPhysicsWatchdog(forcePersist = false) {
  const now = performance.now();
  settleRigidBodies(true);
  persistPhysicsIfNeeded(now, forcePersist);
}

function resize() {
  const rect = root.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  resize();
  runPhysicsWatchdog(false);
  hideRemovedTranslateHandleTypes(translateTransform);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("vw:state", (event) => void rebuild(event.detail || {}));
window.addEventListener("vw:transform-mode", (event) => {
  const mode = event.detail?.mode === "rotate" ? "rotate" : "translate";
  setTransformMode(mode);
});
window.addEventListener("resize", resize);
setTransformMode(transformMode);
void rebuild(editorApi()?.getState?.() || {});
window.setInterval(() => runPhysicsWatchdog(true), PHYSICS_WATCHDOG_INTERVAL_MS);
animate();
