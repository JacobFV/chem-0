import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { TransformControls } from "./vendor/TransformControls.js";

const root = document.querySelector("#vw-scene");
const banner = document.querySelector("#vw-collision-banner");

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

const transform = new TransformControls(camera, renderer.domElement);
transform.setMode("translate");
transform.setSpace("world");
transform.setSize(0.85);
scene.add(transform);

scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.4));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(1.3, -1.1, 1.4);
scene.add(keyLight);

const grid = new THREE.GridHelper(1.2, 24, 0x303030, 0x151515);
grid.rotation.x = Math.PI / 2;
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

const materials = {
  arm: new THREE.MeshStandardMaterial({ color: 0xd8bd55, roughness: 0.55 }),
  camera: new THREE.MeshStandardMaterial({ color: 0x5aa9d8, roughness: 0.5 }),
  light: new THREE.MeshStandardMaterial({ color: 0xf0e7a2, emissive: 0x5c511d, roughness: 0.35 }),
  rigid_body: new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.7 }),
  selected: new THREE.MeshStandardMaterial({ color: 0xf5d76e, roughness: 0.45 }),
  collision: new THREE.MeshStandardMaterial({ color: 0xff4f4f, roughness: 0.5 })
};

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

function makeArm(entity) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.045, 24), materials.arm);
  base.rotation.x = Math.PI / 2;
  base.position.z = 0.022;
  const shoulder = boxMesh({ x: 0.055, y: 0.055, z: 0.16 }, materials.arm);
  shoulder.position.set(0, 0, 0.12);
  const upper = boxMesh({ x: 0.06, y: 0.22, z: 0.045 }, materials.arm);
  upper.position.set(0, 0.11, 0.21);
  const forearm = boxMesh({ x: 0.05, y: 0.2, z: 0.04 }, materials.arm);
  forearm.position.set(0.02, 0.28, 0.2);
  forearm.rotation.z = -0.25;
  const wrist = boxMesh({ x: 0.045, y: 0.08, z: 0.04 }, materials.arm);
  wrist.position.set(0.045, 0.39, 0.18);
  group.add(base, shoulder, upper, forearm, wrist);
  return group;
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
    mesh.rotation.x = Math.PI / 2;
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

function buildEntity(entity) {
  const kind = String(entity.kind);
  if (kind === "arm") return makeArm(entity);
  if (kind === "camera") return makeCamera(entity);
  if (kind === "light") return makeLight(entity);
  return makeRigidBody(entity);
}

function rebuild(state) {
  entities = Array.isArray(state.entities) ? state.entities : [];
  selectedId = String(state.selectedId || "");
  for (const [, group] of objects) scene.remove(group);
  objects.clear();
  pickables.length = 0;
  for (const entity of entities) {
    const id = String(entity.id);
    const group = buildEntity(entity);
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
  updateCollisions();
}

function attachSelected() {
  const group = objects.get(selectedId);
  if (group) transform.attach(group);
  else transform.detach();
}

function collidable(entity) {
  const kind = String(entity.kind);
  return entity.collision_enabled === true && (kind === "arm" || kind === "rigid_body");
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
  return event.dataTransfer?.getData("application/x-chem0-asset") ||
    event.dataTransfer?.getData("text/plain") ||
    window.virtualWorldDragKind ||
    "box";
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  const kind = dragKind(event);
  const point = pointerToGround(event);
  editorApi()?.createEntity?.(kind, { x: point.x, y: point.y, z: kind === "camera" ? 0.4 : kind === "light" ? 0.6 : 0 });
  window.virtualWorldDragKind = "";
}

root.addEventListener("dragover", handleDragOver);
root.addEventListener("drop", handleDrop);
renderer.domElement.addEventListener("dragover", handleDragOver);
renderer.domElement.addEventListener("drop", handleDrop);

transform.addEventListener("dragging-changed", (event) => {
  draggingTransform = Boolean(event.value);
  orbit.enabled = !draggingTransform;
});

transform.addEventListener("objectChange", () => {
  updateCollisions();
});

transform.addEventListener("mouseUp", () => {
  const group = transform.object;
  if (!group?.userData?.entityId) return;
  const id = String(group.userData.entityId);
  const entity = entities.find((item) => String(item.id) === id);
  const pose = entityPose(entity);
  pose.x = group.position.x;
  pose.y = group.position.y;
  pose.z = group.position.z;
  editorApi()?.updateEntityPose?.(id, pose);
});

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
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

window.addEventListener("vw:state", (event) => rebuild(event.detail || {}));
window.addEventListener("resize", resize);
animate();
