import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { STLLoader } from "./vendor/STLLoader.js";
import { TransformControls } from "./vendor/TransformControls.js";

const root = document.querySelector("#vw-scene");
const banner = document.querySelector("#vw-collision-banner");
const dropStatus = document.querySelector("#vw-drop-status");

function editorApi() {
  return window.virtualWorldEditor;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020202);

const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 20);
camera.position.set(0.7, -1.05, 0.75);
camera.lookAt(0, 0, 0.08);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio || 1);
root.append(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 0, 0.08);
orbit.enableDamping = true;
orbit.dampingFactor = 0.15;

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

scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(1.3, -1.1, 1.4);
scene.add(keyLight);

const FLOOR_Z = 0;
const GRAVITY_M_PER_FRAME = 0.006;
const CONTACT_EPSILON_M = 0.0005;
const FLOOR_SIZE_M = 1.6;
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85, metalness: 0.02 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_SIZE_M, FLOOR_SIZE_M), floorMaterial);
floor.receiveShadow = true;
floor.position.z = FLOOR_Z;
scene.add(floor);

const grid = new THREE.GridHelper(1.2, 24, 0x303030, 0x151515);
grid.rotation.x = Math.PI / 2;
grid.position.z = FLOOR_Z + 0.001;
scene.add(grid);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const dropPoint = new THREE.Vector3();
const objects = new Map();
const pickables = [];
let entities = [];
let selectedId = "";
let draggingTransform = false;
let dropStatusTimer = 0;
let transformMode = "translate";
let robotAsset = null;
let rebuildSequence = 0;
let lastPhysicsPersistMs = 0;
let lastPhysicsChangeMs = 0;
const physicsDirtyIds = new Set();

const materials = {
  arm: new THREE.MeshStandardMaterial({ color: 0xd8bd55, roughness: 0.55 }),
  camera: new THREE.MeshStandardMaterial({ color: 0x5aa9d8, roughness: 0.5 }),
  light: new THREE.MeshStandardMaterial({ color: 0xf0e7a2, emissive: 0x5c511d, roughness: 0.35 }),
  rigid_body: new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.7 }),
  selected: new THREE.MeshStandardMaterial({ color: 0xf5d76e, roughness: 0.45 }),
  collision: new THREE.MeshStandardMaterial({ color: 0xff4f4f, roughness: 0.5 })
};

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
  hideRemovedTranslateHandleTypes(translateTransform);
}

function installTransformEvents(control) {
  control.addEventListener("dragging-changed", (event) => {
    draggingTransform = Boolean(event.value);
    orbit.enabled = !draggingTransform;
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
    if (node.isMesh) node.material = material;
  });
}

function boxMesh(size, material) {
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeCamera() {
  const group = new THREE.Group();
  const body = boxMesh({ x: 0.045, y: 0.035, z: 0.025 }, materials.camera);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.02, 18), materials.camera);
  lens.rotation.x = Math.PI / 2;
  lens.position.y = -0.026;
  group.add(body, lens);
  return group;
}

function makeLight() {
  const group = new THREE.Group();
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 20, 12), materials.light);
  const helper = new THREE.PointLight(0xffffff, 0.8, 2);
  group.add(bulb, helper);
  return group;
}

function makeRigidBody(entity) {
  const spec = entitySpec(entity);
  if (spec.collision_shape === "cylinder") {
    const radius = Number(spec.radius_m) || 0.012;
    const height = Number(spec.height_m) || 0.05;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24), materials.rigid_body);
    mesh.position.z = height / 2;
    const group = new THREE.Group();
    group.add(mesh);
    return group;
  }
  const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.05, 0.05, 0.05];
  const group = new THREE.Group();
  const mesh = boxMesh({ x: dims[0] || 0.05, y: dims[1] || 0.05, z: dims[2] || 0.05 }, materials.rigid_body);
  mesh.position.z = (dims[2] || 0.05) / 2;
  group.add(mesh);
  return group;
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
        pickables.push(node);
      }
    });
  }
  attachSelected();
  settleRigidBodies(false);
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
    const otherBox = new THREE.Box3().setFromObject(other);
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
      const box = new THREE.Box3().setFromObject(group);
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

function persistPhysicsIfNeeded(now) {
  if (draggingTransform || physicsDirtyIds.size === 0 || now - lastPhysicsChangeMs < 250 || now - lastPhysicsPersistMs < 600) return;
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
  for (const item of groups) item.box.setFromObject(item.group);
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
    const group = objects.get(String(entity.id));
    if (!group) continue;
    if (collisions.has(String(entity.id))) applyMaterial(group, materials.collision);
    else if (String(entity.id) === selectedId) applyMaterial(group, materials.selected);
    else applyMaterial(group, materials[String(entity.kind)] || materials.rigid_body);
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
  if (draggingTransform) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables, false)[0];
  if (!hit) return;
  const id = hit.object.userData.entityId;
  if (id && editorApi()?.selectEntity) editorApi().selectEntity(String(id));
});

function dragKind(event) {
  const kind = event.dataTransfer?.getData("application/x-chem0-asset") || event.dataTransfer?.getData("text/plain") || "";
  return ["arm", "camera", "light", "box", "vial"].includes(kind) ? kind : "";
}

function validKind(kind) {
  return ["arm", "camera", "light", "box", "vial"].includes(kind) ? kind : "";
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
  orbit.update();
  const now = performance.now();
  settleRigidBodies(true);
  persistPhysicsIfNeeded(now);
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
animate();
