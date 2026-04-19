import { geoEquirectangular, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import { createNoise3D } from 'simplex-noise';
import type { BiomeType } from './types';

// ── Textures ──────────────────────────────────────────────────────────────────
let landData: Uint8ClampedArray | null = null;
let landW = 0, landH = 0;

// Blurred land mask: 0=open ocean, ~0.5=coast boundary, 1.0=deep inland
let proxData: Uint8ClampedArray | null = null;
let proxW = 0, proxH = 0;

export async function buildLandMask(onProgress?: (pct: number) => void): Promise<void> {
  onProgress?.(0);
  const worldAtlas = await import('world-atlas/land-110m.json');
  const land = feature(worldAtlas as any, (worldAtlas as any).objects.land);
  onProgress?.(20);

  // High-res binary land mask (white=land, black=ocean)
  const LW = 1024, LH = 512;
  landW = LW; landH = LH;
  const landCanvas = document.createElement('canvas');
  landCanvas.width = LW; landCanvas.height = LH;
  const lCtx = landCanvas.getContext('2d')!;
  const proj = geoEquirectangular().scale(LW / (2 * Math.PI)).translate([LW / 2, LH / 2]);
  lCtx.fillStyle = '#000';
  lCtx.fillRect(0, 0, LW, LH);
  lCtx.fillStyle = '#fff';
  lCtx.beginPath();
  geoPath(proj, lCtx)(land);
  lCtx.fill();
  landData = lCtx.getImageData(0, 0, LW, LH).data;
  onProgress?.(50);

  // ── Coastal proximity texture via Gaussian blur ───────────────────────────
  // On a 512×256 canvas, blur=5px → transition zone ≈ 10px = ~700 km
  // (one H3-res3 hex ≈ 300 km, so ~2 hex widths of smooth gradient)
  const PW = 512, PH = 256;
  proxW = PW; proxH = PH;

  const src = document.createElement('canvas');
  src.width = PW; src.height = PH;
  const sCtx = src.getContext('2d')!;
  sCtx.drawImage(landCanvas, 0, 0, PW, PH);

  // Pass 1 – wide blur to create smooth gradient
  const pass1 = document.createElement('canvas');
  pass1.width = PW; pass1.height = PH;
  const p1 = pass1.getContext('2d')!;
  p1.filter = 'blur(5px)';
  p1.drawImage(src, 0, 0);
  p1.filter = 'none';

  // Pass 2 – second blur for extra softness
  const pass2 = document.createElement('canvas');
  pass2.width = PW; pass2.height = PH;
  const p2 = pass2.getContext('2d')!;
  p2.filter = 'blur(4px)';
  p2.drawImage(pass1, 0, 0);
  p2.filter = 'none';

  proxData = p2.getImageData(0, 0, PW, PH).data;
  onProgress?.(100);
}

function sampleLand(lat: number, lng: number): boolean {
  if (!landData) return false;
  const x = Math.min(Math.floor(((lng + 180) / 360) * landW), landW - 1);
  const y = Math.min(Math.floor(((90 - lat) / 180) * landH), landH - 1);
  return landData[(y * landW + x) * 4] > 128;
}

export function isLand(lat: number, lng: number): boolean {
  return sampleLand(lat, lng);
}

// Returns 0 at coast boundary → 1 deep inland (valid for both land and ocean)
function sampleProx(lat: number, lng: number): number {
  if (!proxData) return 0.5;
  const x = Math.min(Math.floor(((lng + 180) / 360) * proxW), proxW - 1);
  const y = Math.min(Math.floor(((90 - lat) / 180) * proxH), proxH - 1);
  return proxData[(y * proxW + x) * 4] / 255;
}

// Taper: 0 exactly at coast boundary → 1 far inland
// Uses threshold=0.45 so coast tiles with blurVal≤0.45 get taper=0
function coastTaper(lat: number, lng: number): number {
  const p = sampleProx(lat, lng);
  return Math.max(0, (p - 0.45) / 0.55);
}

// ── Elevation noise ───────────────────────────────────────────────────────────
const noise3D = createNoise3D();

function noiseAt(lat: number, lng: number, scale: number): number {
  const phi   = (lat * Math.PI) / 180;
  const theta = (lng * Math.PI) / 180;
  const x = Math.cos(phi) * Math.cos(theta) * scale;
  const y = Math.cos(phi) * Math.sin(theta) * scale;
  const z = Math.sin(phi) * scale;
  return (noise3D(x, y, z) + 1) / 2;
}

function elevNoise(lat: number, lng: number): number {
  return noiseAt(lat, lng, 1.5) * 0.50
    + noiseAt(lat, lng, 3.0)  * 0.28
    + noiseAt(lat, lng, 6.0)  * 0.14
    + noiseAt(lat, lng, 12.0) * 0.08;
}

// ── Public cell computation ───────────────────────────────────────────────────

const MAX_LEVEL  = 8;
const LEVEL_STEP = 0.009;
export const BASE_SPHERE_R = 1.0;

export function levelToRadius(level: number): number {
  return BASE_SPHERE_R + level * LEVEL_STEP;
}

/**
 * Computes level (0–8) and biome for a single hex center.
 *
 * Key idea: land height = taper(coast_distance) × elevation_noise
 *   - taper=0 exactly at the coast boundary → level 0, same as ocean
 *   - taper increases smoothly moving inland
 *   → no visible cliff at the shoreline
 */
export function computeCell(
  lat: number, lng: number, isLandCell: boolean,
): { level: number; biome: BiomeType } {
  if (!isLandCell) {
    // Ocean: always flat (level 0), color by proximity to shore
    const p = sampleProx(lat, lng);
    const biome: BiomeType = p > 0.30 ? 'shallow-ocean' : 'deep-ocean';
    return { level: 0, biome };
  }

  const taper = coastTaper(lat, lng);           // 0 at coast → 1 inland
  const elev  = elevNoise(lat, lng);            // 0–1 noise
  const h     = taper * elev;                   // 0 at coast, increases inland

  const level = Math.min(MAX_LEVEL, Math.round(h * MAX_LEVEL));

  let biome: BiomeType;

  if (taper < 0.10) {
    // Right at coast boundary
    biome = 'coast';
  } else if (h > 0.72) {
    biome = 'snow';
  } else if (h > 0.55) {
    biome = 'mountain';
  } else if (h > 0.40) {
    biome = 'highland';
  } else {
    const absLat = Math.abs(lat);
    if (absLat > 65) {
      biome = taper < 0.3 ? 'coast' : 'tundra';
    } else if (absLat < 22 && noiseAt(lat, lng, 2.5) > 0.62) {
      biome = 'desert';
    } else {
      biome = 'grassland';
    }
  }

  return { level, biome };
}

// ── Colors ────────────────────────────────────────────────────────────────────
// Simple 3-tone land palette: beige coast / green land / gray mountain

export function getBiomeColor(biome: BiomeType): [number, number, number] {
  const map: Record<BiomeType, [number, number, number]> = {
    'deep-ocean':    [0.02, 0.08, 0.28],
    'shallow-ocean': [0.04, 0.19, 0.46],
    'ice':           [0.80, 0.88, 0.94],
    'coast':         [0.78, 0.68, 0.52],   // warm beige
    'lowland':       [0.30, 0.54, 0.22],
    'grassland':     [0.30, 0.54, 0.22],   // green
    'forest':        [0.26, 0.48, 0.18],
    'tundra':        [0.35, 0.50, 0.27],
    'desert':        [0.72, 0.64, 0.38],
    'highland':      [0.52, 0.50, 0.46],   // gray-green transition
    'mountain':      [0.58, 0.56, 0.52],   // gray
    'snow':          [0.88, 0.90, 0.93],   // light gray-white
  };
  return map[biome];
}
