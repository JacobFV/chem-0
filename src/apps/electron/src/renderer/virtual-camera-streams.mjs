import * as THREE from "three";

const renderers = new Map();
let worlds = [];
let entities = [];
let selectedWorldId = document.body.dataset.worldId || "world_physical_default";
let lastRefreshMs = 0;

function poseOf(entity) {
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

function specOf(entity) {
  return entity?.spec && typeof entity.spec === "object" && !Array.isArray(entity.spec) ? entity.spec : {};
}

function applyPose(object, entity) {
  const pose = poseOf(entity);
  object.position.set(pose.x, pose.y, pose.z);
  object.rotation.set(
    THREE.MathUtils.degToRad(pose.roll),
    THREE.MathUtils.degToRad(pose.pitch),
    THREE.MathUtils.degToRad(pose.yaw)
  );
}

function makeEntityMesh(entity) {
  const kind = String(entity.kind);
  const group = new THREE.Group();
  if (kind === "camera") {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.035, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x5aa9d8, roughness: 0.5 })
    );
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.018, 0.02, 18),
      new THREE.MeshStandardMaterial({ color: 0x77c8ff, roughness: 0.45 })
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.y = -0.026;
    group.add(body, lens);
  } else if (kind === "light") {
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 20, 12),
      new THREE.MeshStandardMaterial({ color: 0xf0e7a2, emissive: 0x5c511d, roughness: 0.35 })
    );
    const light = new THREE.PointLight(0xffffff, 1, 2);
    group.add(bulb, light);
  } else if (kind === "arm") {
    const material = new THREE.MeshStandardMaterial({ color: 0xd8bd55, roughness: 0.58 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.04, 24), material);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.035), material);
    lower.position.set(0, 0.06, 0.09);
    lower.rotation.x = -0.35;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.14, 0.032), material);
    upper.position.set(0, 0.12, 0.18);
    upper.rotation.x = 0.5;
    group.add(base, lower, upper);
  } else {
    const spec = specOf(entity);
    const dims = Array.isArray(spec.dimensions_m) ? spec.dimensions_m.map(Number) : [0.05, 0.05, 0.05];
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(dims[0] || 0.05, dims[1] || 0.05, dims[2] || 0.05),
      new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.7 })
    );
    mesh.position.z = (dims[2] || 0.05) / 2;
    group.add(mesh);
  }
  applyPose(group, entity);
  return group;
}

function buildScene(worldEntities, activeCameraId) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020202);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(1.3, -1.1, 1.4);
  scene.add(key);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85, metalness: 0.02 })
  );
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(1.2, 24, 0x303030, 0x151515);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = 0.001;
  scene.add(grid);

  for (const entity of worldEntities) {
    if (String(entity.id) === activeCameraId) continue;
    scene.add(makeEntityMesh(entity));
  }
  return scene;
}

function cameraFromEntity(entity, canvas) {
  const spec = specOf(entity);
  const fov = Number(spec.fov_degrees) || 60;
  const camera = new THREE.PerspectiveCamera(fov, Math.max(1, canvas.width) / Math.max(1, canvas.height), 0.01, 20);
  applyPose(camera, entity);
  camera.rotateX(-Math.PI / 2);
  return camera;
}

function rendererFor(canvas) {
  let renderer = renderers.get(canvas);
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderers.set(canvas, renderer);
  return renderer;
}

async function refreshWorldState() {
  if (!window.chem0 || performance.now() - lastRefreshMs < 1200) return;
  lastRefreshMs = performance.now();
  const result = await window.chem0.callTool("list_worlds", {});
  worlds = Array.isArray(result.worlds) ? result.worlds : [];
  entities = Array.isArray(result.virtual_entities) ? result.virtual_entities : [];
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || 320));
  const height = Math.max(1, Math.floor(rect.height || 180));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function renderVirtualCameras() {
  const world = worlds.find((item) => String(item.id) === selectedWorldId);
  if (String(world?.type || "") !== "virtual") return;
  const worldEntities = entities.filter((entity) => String(entity.world_id) === selectedWorldId);
  const cameras = worldEntities.filter((entity) => String(entity.kind) === "camera");
  for (const cameraEntity of cameras) {
    const id = String(cameraEntity.id);
    const canvas = document.querySelector(`.virtual-camera-preview[data-camera-id="${CSS.escape(id)}"]`);
    if (!(canvas instanceof HTMLCanvasElement)) continue;
    resizeCanvas(canvas);
    const renderer = rendererFor(canvas);
    renderer.setSize(canvas.width, canvas.height, false);
    renderer.render(buildScene(worldEntities, id), cameraFromEntity(cameraEntity, canvas));
  }
  window.requestAnimationFrame(() => window.dispatchEvent(new Event("chem0:virtual-camera-frame")));
}

async function animate() {
  try {
    selectedWorldId = document.body.dataset.worldId || selectedWorldId;
    await refreshWorldState();
    renderVirtualCameras();
  } catch (error) {
    console.error("Virtual camera render failed.", error);
  }
  window.setTimeout(() => void animate(), 500);
}

window.addEventListener("chem0:world-selected", (event) => {
  selectedWorldId = String(event.detail?.worldId || selectedWorldId);
  lastRefreshMs = 0;
});

void animate();
