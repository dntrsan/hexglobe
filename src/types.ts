export type BiomeType =
  | 'deep-ocean' | 'shallow-ocean' | 'coast'
  | 'lowland' | 'grassland' | 'forest'
  | 'highland' | 'mountain' | 'snow'
  | 'desert' | 'tundra' | 'ice';

export interface TerrainCell {
  h3Index: string;
  lat: number;
  lng: number;
  isLand: boolean;
  elevation: number;
  biome: BiomeType;
  level: number; // 0=deep ocean … 8=snow peak
}

export interface City {
  name: string;
  lat: number;
  lng: number;
  population: number;
}

export interface Landmark {
  name: string;
  emoji: string;
  lat: number;
  lng: number;
}
