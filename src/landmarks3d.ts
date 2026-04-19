import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { landmarks } from './data/landmarks';
import { isLand, computeCell, levelToRadius } from './terrain';

const VOXEL     = 0.0021;
const TILE_GAP  = 0.004;  // extra clearance above the tile surface
const SHOW_DIST = 1.65;

// [x, y, z, 0xRRGGBB]  –– local voxel coordinates, y = up (away from globe)
type V = readonly [number, number, number, number];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fill a solid box of voxels */
function bx(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, c: number): V[] {
  const out: V[] = [];
  for (let x = x1; x <= x2; x++)
  for (let y = y1; y <= y2; y++)
  for (let z = z1; z <= z2; z++)
    out.push([x, y, z, c]);
  return out;
}

/** Place voxels from a 2D pixel-art grid at height y */
function px(grid: number[][], y: number, c: number): V[] {
  const rows = grid.length, cols = grid[0].length;
  const ox = (cols - 1) / 2, oz = (rows - 1) / 2;
  const out: V[] = [];
  for (let zi = 0; zi < rows; zi++)
    for (let xi = 0; xi < cols; xi++)
      if (grid[zi][xi]) out.push([Math.round(xi - ox), y, Math.round(zi - oz), c]);
  return out;
}

// ── Building designs ────────────────────────────────────────────────────────���─

const DEFS: Record<string, V[]> = {

  PYRAMID: [
    ...bx(-2,0,-2, 2,0, 2, 0xD4B87A),
    ...bx(-2,1,-2, 2,1, 2, 0xC8AC6E),
    ...bx(-1,2,-1, 1,2, 1, 0xBCA064),
    ...bx(-1,3,-1, 1,3, 1, 0xB0945A),
    ...[[ 0,4, 0, 0xA48850]] as V[],
  ],

  STEPPED_PYRAMID: [   // Chichen Itza
    ...bx(-3,0,-3, 3,1, 3, 0xC8B890), ...bx(-2,2,-2, 2,3, 2, 0xBCAC84),
    ...bx(-1,4,-1, 1,5, 1, 0xB0A07A), ...bx( 0,6, 0, 0,7, 0, 0xF0E8C0),
  ],

  EIFFEL: ((): V[] => {
    const ir = 0x7A7060, dk = 0x5A5048;
    return [
      // 4 corner legs
      ...[-2,2].flatMap(x => [-2,2].flatMap(z =>
        [[x,0,z,ir],[x,1,z,ir],[x,2,z,ir]] as V[])),
      // Horizontal braces at y=1
      ...[-1,0,1].map(x => [x,1,-2,ir] as V),
      ...[-1,0,1].map(x => [x,1, 2,ir] as V),
      ...[-1,0,1].map(z => [-2,1,z,ir] as V),
      ...[-1,0,1].map(z => [ 2,1,z,ir] as V),
      // First platform
      ...bx(-2,2,-2, 2,2,2, dk),
      // Upper legs
      ...[-1,1].flatMap(x => [-1,1].flatMap(z =>
        [[x,3,z,ir],[x,4,z,ir]] as V[])),
      // Second platform
      ...bx(-1,5,-1, 1,5,1, dk),
      // Spire
      ...[6,7,8,9,10,11,12].map(y => [0,y,0,ir] as V),
      [0,13,0,0xB0A870],
    ];
  })(),

  BIG_BEN: [
    ...bx(-2,0,-2, 2,1, 2, 0xA09080),   // base
    ...bx(-1,2,-1, 1,8, 1, 0x98887A),   // shaft
    ...bx(-2,9,-2, 2,9, 2, 0xB8A890),   // clock level
    ...bx(-1,10,-1,1,10,1, 0x90807A),   // necking
    ...[11,12,13,14].map(y => [0,y,0, 0x808070] as V),
  ],

  COLOSSEUM: ((): V[] => {
    const s = 0xC8B490, d = 0xA89470;
    // Oval ring 3 rows tall
    const ring = [
      [0,1,1,1,1,1,0],
      [1,1,1,0,1,1,1],
      [1,1,0,0,0,1,1],
      [1,1,1,0,1,1,1],
      [0,1,1,1,1,1,0],
    ];
    return [
      ...px(ring, 0, s), ...px(ring, 1, s), ...px(ring, 2, d),
    ];
  })(),

  TAJ: [
    ...bx(-3,0,-3, 3,0, 3, 0xD8D4C8),  // plinth
    ...bx(-2,1,-2, 2,1, 2, 0xF0EDE5),  // base building
    ...bx(-1,2,-1, 1,2, 1, 0xF0EDE5),
    // Dome (layered circles)
    ...px([[0,1,1,1,0],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[0,1,1,1,0]], 3, 0xF0EDE5),
    ...px([[0,0,1,0,0],[0,1,1,1,0],[0,1,1,1,0],[0,1,1,1,0],[0,0,1,0,0]], 4, 0xF0EDE5),
    [0,5,0, 0xF0EDE5],
    // 4 minarets at corners
    ...[-3,3].flatMap(x => [-3,3].flatMap(z =>
      [[x,1,z,0xE8E4DC],[x,2,z,0xE8E4DC],[x,3,z,0xE8E4DC],[x,4,z,0xE8E4DC]] as V[])),
  ],

  CHRIST: [
    ...bx(-1,0,-1, 1,1, 1, 0xC0B8A8),  // pedestal
    [0,2,0, 0xD0C8B8],[0,3,0, 0xD0C8B8],
    // Arms
    ...[-3,-2,-1,0,1,2,3].map(x => [x,3,0, 0xD0C8B8] as V),
    [0,4,0, 0xD0C8B8],
    ...px([[0,1,1,0],[1,1,1,1],[0,1,1,0]], 5, 0xD0C8B8),  // head
  ],

  OPERA: ((): V[] => {
    const w = 0xF0EEEC, b = 0xD0CEC8;
    return [
      ...bx(-4,0,-3, 4,0, 3, b),  // platform
      // Shell 1 (ascending triangle leftward)
      [-2,1,-1,w],[-2,1,0,w],[-2,1,1,w],[-1,1,-1,w],[-1,1,0,w],[-1,1,1,w],
      [-2,2,-1,w],[-2,2,0,w],[-2,2,1,w],[-2,3,0,w],
      // Shell 2
      [1,1,-1,w],[1,1,0,w],[1,1,1,w],[2,1,-1,w],[2,1,0,w],[2,1,1,w],
      [1,2,0,w],[2,2,0,w],[3,2,0,w],[3,3,0,w],
    ];
  })(),

  BURJ: [
    ...bx(-2,0,-2, 2,2, 2, 0x8898B0),
    ...bx(-1,3,-1, 1,7, 1, 0x90A0B8),
    ...bx( 0,8, 0, 0,16,0, 0xA0B0C0),
  ],

  GOLDEN_GATE: [
    // Left tower
    ...bx(-3,0,-1,-3,8, 1, 0xC04020),
    ...bx(-4,7,-1,-2,8, 1, 0xC04020),  // top cap
    // Right tower
    ...bx( 3,0,-1, 3,8, 1, 0xC04020),
    ...bx( 2,7,-1, 4,8, 1, 0xC04020),
    // Road deck at y=3
    ...bx(-3,3, 0, 3,3, 0, 0xA83810),
    // Cables (approximate diagonal)
    [-2,5,-0,0xC04020],[-1,4,-0,0xC04020],[1,4,-0,0xC04020],[2,5,-0,0xC04020],
  ],

  MOAI: [
    ...bx(-1,0,-1, 1,1, 1, 0x605850),  // base
    ...bx(-1,2,-0, 1,4, 0, 0x5A5048),  // body / face (flat front)
    ...bx(-1,2,-1, 1,4,-1, 0x504840),  // back
    ...bx(-1,2, 1, 1,4, 1, 0x504840),  // sides
    ...bx(-1,5,-1, 1,6, 1, 0x685E52),  // forehead
    ...bx(-1,7,-1, 1,7, 0, 0x6A5040),  // topknot (pukao) front
    ...bx(-1,7,-1, 1,8,-1, 0x6A3020),  // topknot red
  ],

  STONEHENGE: ((): V[] => {
    const s = 0xA09080;
    const out: V[] = [];
    // Ring of 8 uprights on a rough circle r≈3
    const angles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4];
    for (const a of angles) {
      const x = Math.round(3 * Math.cos(a)), z = Math.round(3 * Math.sin(a));
      out.push([x,0,z,s],[x,1,z,s],[x,2,z,s]);
    }
    // Lintels connecting adjacent pairs
    for (let i = 0; i < angles.length; i += 2) {
      const a1 = angles[i], a2 = angles[i+1];
      const mx = Math.round(3 * Math.cos((a1+a2)/2));
      const mz = Math.round(3 * Math.sin((a1+a2)/2));
      out.push([mx,3,mz,0x908070]);
    }
    return out;
  })(),

  CASTLE: [
    ...bx(-3,0,-3, 3,1, 3, 0xA09890),  // walls
    ...bx(-3,2,-3, 3,2,-3, 0xB0A8A0),  // front wall top
    ...bx(-3,2, 3, 3,2, 3, 0xB0A8A0),
    ...bx(-3,2,-3,-3,2, 3, 0xB0A8A0),
    ...bx( 3,2,-3, 3,2, 3, 0xB0A8A0),
    // Main keep (center tower)
    ...bx(-1,0,-1, 1,6, 1, 0x9890A0),
    [0,7,0,0x4878B0],[0,8,0,0x4878B0],  // blue pointed roof
    [-1,7,-1,0x4878B0],[1,7,-1,0x4878B0],[-1,7,1,0x4878B0],[1,7,1,0x4878B0],
    // Corner turrets
    ...[-3,3].flatMap(x => [-3,3].flatMap(z =>
      [[x,0,z,0x9898A0],[x,1,z,0x9898A0],[x,2,z,0x9898A0],[x,3,z,0x5880B0]] as V[])),
  ],

  COLUMNS: [   // Parthenon / ancient temple
    ...bx(-4,0,-2, 4,0, 2, 0xD0C8B0),  // stylobate
    // Columns: 5 across front/back, 3 on sides
    ...[-4,-2,0,2,4].flatMap(x =>
      [-2,2].flatMap(z =>
        [[x,1,z,0xD8D0C0],[x,2,z,0xD8D0C0],[x,3,z,0xD8D0C0],[x,4,z,0xD8D0C0]] as V[])),
    ...bx(-4,5,-2, 4,5, 2, 0xD0C8B0),  // entablature
    // Triangular pediment
    ...[-3,-2,-1,0,1,2,3].map((x,i) => [x,6+Math.max(0,3-Math.abs(i-3)),0, 0xC8C0A8] as V),
  ],

  FUJI: [
    ...bx(-4,0,-4, 4,0, 4, 0x806868),
    ...bx(-3,1,-3, 3,1, 3, 0x786060),
    ...bx(-3,2,-3, 3,2, 3, 0x706060),
    ...bx(-2,3,-2, 2,3, 2, 0x706868),
    ...bx(-2,4,-2, 2,4, 2, 0x906868),
    ...bx(-1,5,-1, 1,5, 1, 0xC0C8D0),   // snow
    ...bx(-1,6,-1, 1,6, 1, 0xD8E0E8),
    [0,7,0, 0xEEEEF8],
  ],

  GOTHIC_SPIRES: [  // Sagrada Familia
    ...bx(-3,0,-2, 3,2, 2, 0xC8BC98),   // nave
    // Two main spires
    ...bx(-2,0,-1,-2,12,1, 0xC0B490),
    ...bx( 2,0,-1, 2,12,1, 0xC0B490),
    ...bx(-2,13,-1,-2,14,0, 0xD0C8A0),[-2,15,-0,0xE0D8B0],
    ...bx( 2,13,-1, 2,14,0, 0xD0C8A0),[ 2,15,-0,0xE0D8B0],
    // Four smaller spires
    ...[-4,4].flatMap(x =>
      [...bx(x,0,-1,x,8,1, 0xC8BC98), [x,9,0, 0xD8D0A8]] as V[]),
  ],

  HAGIA_SOPHIA: [
    ...bx(-3,0,-3, 3,1, 3, 0xC8C0A8),   // base
    ...bx(-2,2,-2, 2,3, 2, 0xD0C8B0),
    // Main dome
    ...px([[0,1,1,1,0],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[0,1,1,1,0]], 4, 0xD8D0C0),
    ...px([[0,0,1,0,0],[0,1,1,1,0],[0,1,1,1,0],[0,1,1,1,0],[0,0,1,0,0]], 5, 0xD8D0C0),
    [0,6,0, 0xE0D8C8],
    // 4 minarets
    ...[-3,3].flatMap(x => [-3,3].flatMap(z =>
      [[x,1,z,0xC0B8A0],[x,2,z,0xC0B8A0],[x,3,z,0xC0B8A0],[x,4,z,0xC0B8A0],[x,5,z,0xC0B8A0]] as V[])),
  ],

  LIBERTY: [
    ...bx(-2,0,-2, 2,2, 2, 0xA09880),   // pedestal
    [0,3,0,0x7AA08A],[0,4,0,0x7AA08A],   // robe body
    // Torch arm
    [1,4,0,0x7AA08A],[2,5,0,0x7AA08A],[2,6,0,0x8FB09A],[2,7,0,0xFFD060],
    // Crown / head
    ...px([[0,1,0],[1,1,1],[0,1,0]], 5, 0x7AA08A),
    ...[-1,0,1].map(x => [x,6,0, 0x88B0A0] as V),
  ],

  LEANING_TOWER: ((): V[] => {   // Pisa (slight lean toward +x)
    const w = 0xF0EDE0, s = 0xD8D4C8;
    const voxels: V[] = [...bx(-1,0,-1, 1,0, 1, s)];
    for (let y = 1; y <= 8; y++) {
      const lean = y > 4 ? 1 : 0;
      voxels.push(...bx(lean-1,y,-1,lean+1,y,1, w));
    }
    // Belfry (slightly narrower)
    voxels.push(...bx(1,9,-1, 2,10,1, s));
    return voxels;
  })(),

  MACHU_PICCHU: [   // terraced walls + single tower
    ...bx(-4,0,-3, 4,0, 3, 0x907858),
    ...bx(-3,1,-2, 3,1, 2, 0x987F5E),
    ...bx(-2,2,-1, 2,2, 1, 0xA08868),
    ...bx(-1,3,-1, 1,3, 1, 0xA89070),
    // Intihuatana stone
    [0,4,0,0xB09878],[0,5,0,0x605040],
  ],

  ANGKOR: [   // central tower + 4 corner towers
    ...bx(-4,0,-4, 4,1, 4, 0xC0A870),
    ...bx(-3,2,-3, 3,3, 3, 0xB09860),
    // Central prasat
    ...bx(-1,3,-1, 1,7, 1, 0xC8B080),
    [0,8,0,0xD8C090],[0,9,0,0xE0C898],
    // 4 corner towers
    ...[-3,3].flatMap(x => [-3,3].flatMap(z =>
      [[x,2,z,0xB89860],[x,3,z,0xB89860],[x,4,z,0xC0A070],[x,5,z,0xC8A878]] as V[])),
  ],

  PETRA: [   // rose-red carved facade
    ...bx(-4,0,-1, 4,5, 0, 0xC07850),  // main facade
    // Columns
    ...[-3,-1,1,3].flatMap(x =>
      [[x,1,0,0xD08860],[x,2,0,0xD08860],[x,3,0,0xD08860],[x,4,0,0xD08860]] as V[]),
    // Entablature
    ...bx(-4,5,0, 4,5, 0, 0xB87040),
    // Pediment / urn
    [0,6,0,0xC87848],[0,7,0,0xC07040],
    // Doorway cutout (dark)
    ...bx(-1,1,-1, 1,3, 0, 0x301810),
  ],

};

// ── Assign a building type to each landmark ───────────────────────────────────
const LANDMARK_TYPES: Record<string, string> = {
  'Eiffel Tower':        'EIFFEL',
  'Statue of Liberty':   'LIBERTY',
  'Great Wall':          'CASTLE',
  'Colosseum':           'COLOSSEUM',
  'Taj Mahal':           'TAJ',
  'Christ the Redeemer': 'CHRIST',
  'Big Ben':             'BIG_BEN',
  'Sydney Opera House':  'OPERA',
  'Burj Khalifa':        'BURJ',
  'Machu Picchu':        'MACHU_PICCHU',
  'Angkor Wat':          'ANGKOR',
  'Parthenon':           'COLUMNS',
  'Mt. Fuji':            'FUJI',
  'Pyramids of Giza':    'PYRAMID',
  'Stonehenge':          'STONEHENGE',
  'Hagia Sophia':        'HAGIA_SOPHIA',
  'Golden Gate Bridge':  'GOLDEN_GATE',
  'Sagrada Família':     'GOTHIC_SPIRES',
  'Tower of Pisa':       'LEANING_TOWER',
  'Neuschwanstein':      'CASTLE',
  'Alhambra':            'CASTLE',
  'Easter Island':       'MOAI',
  'Petra':               'PETRA',
  'Acropolis':           'COLUMNS',
  'Chichen Itza':        'STEPPED_PYRAMID',
};

// ── Geometry builder ──────────────────────────────────────────────────────────

const _boxGeo = new THREE.BoxGeometry(1, 1, 1);

function buildMesh(voxels: V[]): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = [];

  for (const [vx, vy, vz, hex] of voxels) {
    const g = _boxGeo.clone();
    g.translate(vx * VOXEL, (vy + 0.5) * VOXEL, vz * VOXEL);
    g.scale(VOXEL, VOXEL, VOXEL);  // no-op since already sized above... actually translate handles it
    // Reset to unit, re-translate properly
    // BoxGeometry(1,1,1) + scale = VOXEL size
    const g2 = new THREE.BoxGeometry(VOXEL, VOXEL, VOXEL);
    g2.translate(vx * VOXEL, (vy + 0.5) * VOXEL, vz * VOXEL);

    const count = g2.attributes.position.count;
    const rgb = new Float32Array(count * 3);
    const r = ((hex >> 16) & 0xFF) / 255;
    const gr = ((hex >> 8) & 0xFF) / 255;
    const b = (hex & 0xFF) / 255;
    // Vary brightness per face for depth cue (6 faces × 4 verts = 24)
    const faceShading = [1.0, 0.5, 0.85, 0.7, 0.9, 0.75];
    for (let i = 0; i < count; i++) {
      const faceIdx = Math.floor(i / 4);
      const sh = faceShading[faceIdx] ?? 1.0;
      rgb[i*3]   = r * sh;
      rgb[i*3+1] = gr * sh;
      rgb[i*3+2] = b * sh;
    }
    g2.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
    geos.push(g2);
  }

  if (geos.length === 0) return new THREE.Mesh();
  const merged = mergeGeometries(geos, false);
  // free individual clones
  geos.forEach(g => g.dispose());

  return new THREE.Mesh(
    merged,
    new THREE.MeshPhongMaterial({
      vertexColors: true,
      flatShading: false,
      shininess: 20,
    }),
  );
}

// ── Orientation: align mesh Y-axis with sphere outward normal ─────────────────

function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi   = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.cos(theta),
    r * Math.sin(phi),
    r * Math.cos(phi) * Math.sin(theta),
  );
}

function makeOrientation(outward: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    outward.clone().normalize(),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export function createLandmarkBuildings(parent: THREE.Object3D): (camera: THREE.Camera) => void {
  const groups: { group: THREE.Group; worldPos: THREE.Vector3 }[] = [];

  for (const lm of landmarks) {
    const typeName = LANDMARK_TYPES[lm.name];
    const voxels   = typeName ? DEFS[typeName] : null;
    if (!voxels || voxels.length === 0) continue;

    // Place building just above its local tile surface
    const land    = isLand(lm.lat, lm.lng);
    const { level } = computeCell(lm.lat, lm.lng, land);
    const baseR   = levelToRadius(level) + TILE_GAP;

    const mesh      = buildMesh(voxels);
    const pos       = latLngToVec3(lm.lat, lm.lng, baseR);
    const outward   = pos.clone().normalize();

    const group = new THREE.Group();
    group.position.copy(pos);
    group.quaternion.copy(makeOrientation(outward));
    group.add(mesh);
    group.visible = false;
    parent.add(group);

    groups.push({ group, worldPos: pos });
  }

  return function update(camera: THREE.Camera) {
    const dist = camera.position.length();
    const show  = dist < SHOW_DIST;
    const camDir = camera.position.clone().normalize();

    for (const { group, worldPos } of groups) {
      const facing = worldPos.clone().normalize().dot(camDir) > 0.25;
      group.visible = show && facing;
    }
  };
}
