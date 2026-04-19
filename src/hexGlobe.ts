import * as THREE from 'three';
import { getRes0Cells, cellToChildren, cellToBoundary, cellToLatLng } from 'h3-js';
import {
  buildLandMask, isLand, computeCell,
  getBiomeColor, levelToRadius, BASE_SPHERE_R,
} from './terrain';
import type { TerrainCell } from './types';

const GLOBE_RESOLUTION = 3;

function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi   = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.cos(theta),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.sin(theta),
  );
}

function pushTri(
  pos: number[], nor: number[], col: number[],
  v0: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3,
  color: [number, number, number],
  outward: THREE.Vector3,
): void {
  const n = a.clone().sub(v0).cross(b.clone().sub(v0)).normalize();
  const flip = n.dot(outward) < 0;
  if (flip) n.negate();
  const [v1, v2] = flip ? [b, a] : [a, b];
  for (const v of [v0, v1, v2]) {
    pos.push(v.x, v.y, v.z);
    nor.push(n.x, n.y, n.z);
    col.push(...color);
  }
}

function buildHexGeometry(cells: TerrainCell[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];

  for (const cell of cells) {
    const outerR   = levelToRadius(cell.level);
    const boundary = cellToBoundary(cell.h3Index);
    const n        = boundary.length;
    const cTop     = latLngToVec3(cell.lat, cell.lng, outerR);
    const outward  = cTop.clone().normalize();
    const topVerts = boundary.map(([lat, lng]) => latLngToVec3(lat, lng, outerR));
    const topColor = getBiomeColor(cell.biome);

    // ── Top face (triangle fan, no gap) ─────────────────────────────────────
    for (let i = 0; i < n; i++) {
      pushTri(pos, nor, col, cTop, topVerts[i], topVerts[(i + 1) % n], topColor, outward);
    }

    // ── Side faces: down to BASE_SPHERE_R (only for elevated tiles) ──────────
    if (cell.level > 0) {
      const botVerts = boundary.map(([lat, lng]) =>
        latLngToVec3(lat, lng, BASE_SPHERE_R),
      );
      // Side color: darker than top to show depth of stack
      const sc = topColor;
      const sideColor: [number, number, number] = [sc[0] * 0.52, sc[1] * 0.52, sc[2] * 0.52];

      for (let i = 0; i < n; i++) {
        const t1 = topVerts[i],     t2 = topVerts[(i + 1) % n];
        const b1 = botVerts[i],     b2 = botVerts[(i + 1) % n];
        const eMid = t1.clone().add(t2).multiplyScalar(0.5).normalize();
        pushTri(pos, nor, col, t1, b1, t2, sideColor, eMid);
        pushTri(pos, nor, col, t2, b1, b2, sideColor, eMid);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

export async function createHexGlobe(
  onProgress?: (pct: number, msg: string) => void,
): Promise<THREE.Mesh> {
  onProgress?.(0, '地形データを準備中...');

  await buildLandMask((p) => onProgress?.(p * 0.3, p < 50
    ? '陸地マスクを生成中...'
    : '海岸近接フィールドを構築中...',
  ));

  onProgress?.(30, 'ヘックスグリッドを展開中...');

  const allCells: string[] = [];
  for (const r0 of getRes0Cells()) {
    allCells.push(...cellToChildren(r0, GLOBE_RESOLUTION));
  }

  onProgress?.(38, `${allCells.length.toLocaleString()} タイルを分類中...`);

  const terrainCells: TerrainCell[] = [];
  const batchSize = 600;

  for (let i = 0; i < allCells.length; i += batchSize) {
    for (const h3Index of allCells.slice(i, i + batchSize)) {
      const [lat, lng] = cellToLatLng(h3Index);
      const land = isLand(lat, lng);
      const { level, biome } = computeCell(lat, lng, land);
      terrainCells.push({ h3Index, lat, lng, isLand: land, elevation: level / 8, biome, level });
    }
    onProgress?.(
      38 + (i / allCells.length) * 50,
      `タイルを分類中... ${i.toLocaleString()} / ${allCells.length.toLocaleString()}`,
    );
    await new Promise<void>((r) => setTimeout(r, 0));
  }

  onProgress?.(88, 'ジオメトリを構築中...');
  await new Promise<void>((r) => setTimeout(r, 0));

  const geo = buildHexGeometry(terrainCells);
  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 10,
    side: THREE.DoubleSide,
  });

  onProgress?.(100, '完了');
  return new THREE.Mesh(geo, mat);
}
