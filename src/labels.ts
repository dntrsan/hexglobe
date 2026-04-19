import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { cities } from './data/cities';
import { landmarks } from './data/landmarks';

const CITY_SHOW_DIST = 1.85;
const LANDMARK_SHOW_DIST = 1.60;

function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.cos(theta),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.sin(theta),
  );
}

export interface LabelSystem {
  renderer: CSS2DRenderer;
  cityGroup: THREE.Group;
  landmarkGroup: THREE.Group;
  update: (camera: THREE.Camera, globeGroup: THREE.Group) => void;
}

export function createLabelSystem(container: HTMLElement): LabelSystem {
  const labelsLayer = document.getElementById('labels-layer')!;

  const renderer = new CSS2DRenderer({ element: labelsLayer });
  renderer.setSize(container.clientWidth, container.clientHeight);

  // City labels
  const cityGroup = new THREE.Group();
  for (const city of cities) {
    const div = document.createElement('div');
    div.className = 'city-label';
    div.textContent = city.name;
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.3s';

    const obj = new CSS2DObject(div);
    obj.position.copy(latLngToVec3(city.lat, city.lng, 1.01));
    obj.userData = { type: 'city', population: city.population };
    cityGroup.add(obj);
  }

  // Landmark name labels (float above the 3D building)
  const landmarkGroup = new THREE.Group();
  for (const lm of landmarks) {
    const div = document.createElement('div');
    div.className = 'landmark-name-label';
    div.textContent = lm.name;
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.4s';

    const obj = new CSS2DObject(div);
    obj.position.copy(latLngToVec3(lm.lat, lm.lng, 1.04));
    obj.userData = { type: 'landmark' };
    landmarkGroup.add(obj);
  }

  function update(camera: THREE.Camera, globeGroup: THREE.Group): void {
    const camDist = camera.position.length();
    const cameraDir = camera.position.clone().normalize();

    // Cities: show when close enough, and facing camera
    const showCities = camDist < CITY_SHOW_DIST;
    for (const obj of cityGroup.children as CSS2DObject[]) {
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      const facing = worldPos.normalize().dot(cameraDir) > 0.2;
      const el = obj.element as HTMLElement;
      el.style.opacity = (showCities && facing) ? '1' : '0';
    }

    // Landmarks: show when very close, facing
    const showLandmarks = camDist < LANDMARK_SHOW_DIST;
    for (const obj of landmarkGroup.children as CSS2DObject[]) {
      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      const facing = worldPos.normalize().dot(cameraDir) > 0.3;
      const el = obj.element as HTMLElement;
      el.style.opacity = (showLandmarks && facing) ? '1' : '0';
    }

    const renderTarget = (globeGroup.parent as THREE.Scene | null) ?? globeGroup;
    renderer.render(renderTarget as THREE.Scene, camera);
  }

  return { renderer, cityGroup, landmarkGroup, update };
}
