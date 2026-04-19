import * as THREE from 'three';
import { getRes0Cells, cellToChildren, cellToBoundary, cellToLatLng } from 'h3-js';
import { createNoise3D } from 'simplex-noise';

const CLOUD_RADIUS = 1.020;
const CLOUD_RESOLUTION = 2;
const noise3D = createNoise3D();

function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.cos(theta),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.sin(theta),
  );
}

function cloudNoise(lat: number, lng: number, t: number): number {
  const phi = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180 + t * 0.08;
  const x = Math.cos(phi) * Math.cos(theta);
  const y = Math.cos(phi) * Math.sin(theta);
  const z = Math.sin(phi);
  const n = noise3D(x * 2.5, y * 2.5, z * 2.5) * 0.6
    + noise3D(x * 5, y * 5, z * 5) * 0.3
    + noise3D(x * 10, y * 10, z * 10) * 0.1;
  return (n + 1) / 2;
}

export function createCloudLayer(): {
  mesh: THREE.Mesh;
  update: (t: number) => void;
} {
  const res0 = getRes0Cells();
  const allCells: string[] = [];
  for (const r0 of res0) allCells.push(...cellToChildren(r0, CLOUD_RESOLUTION));

  const positions: number[] = [];
  const normals: number[] = [];
  const opacities: number[] = [];

  const cellData: { lat: number; lng: number; vStart: number }[] = [];

  for (const h3Index of allCells) {
    const [lat, lng] = cellToLatLng(h3Index);
    const boundary = cellToBoundary(h3Index);
    const n = boundary.length;
    const center = latLngToVec3(lat, lng, CLOUD_RADIUS);
    const outward = center.clone().normalize();
    const verts = boundary.map(([blat, blng]) =>
      center.clone().lerp(latLngToVec3(blat, blng, CLOUD_RADIUS), 0.88)
    );

    const vStart = positions.length / 3;
    cellData.push({ lat, lng, vStart });

    for (let i = 0; i < n; i++) {
      const v0 = center, v1 = verts[i], v2 = verts[(i + 1) % n];
      const e1 = v1.clone().sub(v0);
      const e2 = v2.clone().sub(v0);
      const norm = e1.cross(e2).normalize();
      if (norm.dot(outward) < 0) norm.negate();

      for (const v of [v0, v1, v2]) {
        positions.push(v.x, v.y, v.z);
        normals.push(norm.x, norm.y, norm.z);
        opacities.push(0);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

  const opacityAttr = new THREE.Float32BufferAttribute(opacities, 1);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('cloudOpacity', opacityAttr);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {},
    vertexShader: `
      attribute float cloudOpacity;
      varying float vOpacity;
      varying vec3 vNormal;
      void main() {
        vOpacity = cloudOpacity;
        vNormal = normalMatrix * normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      varying vec3 vNormal;
      void main() {
        float rim = dot(normalize(vNormal), vec3(0.0, 0.0, 1.0));
        float a = vOpacity * smoothstep(0.0, 0.3, vOpacity);
        gl_FragColor = vec4(0.95, 0.97, 1.0, a * 0.75);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, mat);

  // Pre-cache cell triangles per cell for update
  const triCounts: number[] = [];
  for (const h3Index of allCells) {
    triCounts.push(cellToBoundary(h3Index).length);
  }

  function update(t: number): void {
    const attr = geo.getAttribute('cloudOpacity') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let ci = 0; ci < cellData.length; ci++) {
      const { lat, lng, vStart } = cellData[ci];
      const coverage = cloudNoise(lat, lng, t);
      const alpha = coverage > 0.52 ? Math.pow((coverage - 0.52) / 0.48, 1.5) : 0;
      const tCount = triCounts[ci];
      const vCount = tCount * 3;
      for (let j = vStart; j < vStart + vCount; j++) {
        arr[j] = alpha;
      }
    }
    attr.needsUpdate = true;
  }

  // Initial cloud computation
  update(0);

  return { mesh, update };
}
