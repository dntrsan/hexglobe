import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createHexGlobe } from './hexGlobe';
import { createCloudLayer } from './cloudLayer';
import { createAtmosphere, createStarField } from './atmosphere';
import { createLabelSystem } from './labels';
import { createLandmarkBuildings } from './landmarks3d';
import { initWeatherUI } from './weather';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl  = document.getElementById('loading')!;
const progressEl = document.getElementById('progress-fill') as HTMLElement;
const loadingMsg = document.getElementById('loading-text')!;

function setProgress(pct: number, msg: string) {
  progressEl.style.width = `${pct}%`;
  loadingMsg.textContent = msg;
}

// ── Scene setup ───────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 1);
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 0, 2.8);

// Lights — no shadows
const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.1);
sunLight.position.set(4, 2, 3);
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x304060, 0.3);
fillLight.position.set(-3, -1, -2);
scene.add(fillLight);

// Stars
scene.add(createStarField());

// Globe group (rotates with orbit)
const globeGroup = new THREE.Group();
scene.add(globeGroup);

// Atmosphere
globeGroup.add(createAtmosphere());

// ── Controls ──────────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.15;
controls.maxDistance = 8;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.8;
controls.enablePan = false;

// ── Label system ──────────────────────────────────────────────────────────────
const labelSystem = createLabelSystem(document.getElementById('app')!);
globeGroup.add(labelSystem.cityGroup);
globeGroup.add(labelSystem.landmarkGroup);

// ── Load globe ───────────────────────────────────────────────────────────────
let cloudUpdate: ((t: number) => void) | null = null;
let updateLandmarkLOD: ((camera: THREE.Camera) => void) = () => {};

async function init() {
  try {
    const globeMesh = await createHexGlobe((pct, msg) => setProgress(pct, msg));
    globeGroup.add(globeMesh);

    // Build landmark 3D buildings AFTER terrain data is ready
    setProgress(97, 'ランドマークを配置中...');
    await new Promise<void>((r) => setTimeout(r, 0));
    updateLandmarkLOD = createLandmarkBuildings(globeGroup);

    setProgress(99, 'クラウドレイヤーを生成中...');
    await new Promise<void>((r) => setTimeout(r, 0));

    const { mesh: cloudMesh, update } = createCloudLayer();
    cloudUpdate = update;
    globeGroup.add(cloudMesh);

    // Hide loading screen
    loadingEl.classList.add('hidden');
    setTimeout(() => { loadingEl.style.display = 'none'; }, 1000);

    initWeatherUI();
  } catch (err) {
    console.error(err);
    loadingMsg.textContent = 'エラーが発生しました。リロードしてください。';
  }
}

// ── Resize handler ────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelSystem.renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Animation loop ────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  controls.update();

  // Slow auto-rotation when user is not dragging
  if (!controls.autoRotate) {
    globeGroup.rotation.y += 0.0003;
  }

  // Cloud animation (slow drift)
  if (cloudUpdate) {
    cloudUpdate(elapsed * 0.012);
  }

  renderer.render(scene, camera);
  labelSystem.update(camera, globeGroup);
  updateLandmarkLOD(camera);
}

animate();
init();
