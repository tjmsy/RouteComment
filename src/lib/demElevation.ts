import type { TrackPoint } from "./types";

const TERRARIUM_TILE_URL = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";
const TILE_SIZE = 512;
const DEFAULT_ZOOM = 14;

type TileKey = string;

const tileCache = new Map<TileKey, Float32Array>();

function tileKey(z: number, x: number, y: number): TileKey {
  return `${z}/${x}/${y}`;
}

function projectLngLat(
  lng: number,
  lat: number,
  z: number,
  tileSize: number
): { tileX: number; tileY: number; px: number; py: number } {
  const worldSize = tileSize * 2 ** z;
  const x = ((lng + 180) / 360) * worldSize;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
  return {
    tileX: Math.floor(x / tileSize),
    tileY: Math.floor(y / tileSize),
    px: x % tileSize,
    py: y % tileSize,
  };
}

function decodeTerrariumPixel(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

async function fetchTerrariumTile(
  z: number,
  x: number,
  y: number
): Promise<Float32Array> {
  const key = tileKey(z, x, y);
  const cached = tileCache.get(key);
  if (cached) return cached;

  const url = TERRARIUM_TILE_URL.replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));

  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load DEM tile ${key}`));
    img.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available");
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  const elevations = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    elevations[j] = decodeTerrariumPixel(data[i], data[i + 1], data[i + 2]);
  }

  tileCache.set(key, elevations);
  return elevations;
}

export function needsDemElevation(points: TrackPoint[]): boolean {
  if (points.length === 0) return false;
  return !points.every(
    (p) => typeof p.ele === "number" && Number.isFinite(p.ele)
  );
}

export type DemElevationProgress = {
  done: number;
  total: number;
};

/**
 * Sample elevation from Mapterhorn Terrarium tiles for points missing GPX ele.
 * Returns a new array with ele filled in where possible.
 */
export async function fillElevationFromDem(
  points: TrackPoint[],
  options?: {
    signal?: AbortSignal;
    onProgress?: (p: DemElevationProgress) => void;
    zoom?: number;
  }
): Promise<TrackPoint[]> {
  if (points.length === 0) return points;
  if (!needsDemElevation(points)) return points;

  const z = options?.zoom ?? DEFAULT_ZOOM;
  const indices: number[] = [];
  for (let i = 0; i < points.length; i++) {
    if (!(
      typeof points[i].ele === "number" && Number.isFinite(points[i].ele)
    )) {
      indices.push(i);
    }
  }

  if (indices.length === 0) return points;

  const groups = new Map<string, { index: number; px: number; py: number }[]>();

  for (const index of indices) {
    const p = points[index];
    const proj = projectLngLat(p.lng, p.lat, z, TILE_SIZE);
    const key = tileKey(z, proj.tileX, proj.tileY);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({
      index,
      px: Math.floor(proj.px),
      py: Math.floor(proj.py),
    });
  }

  const result = points.map((p) => ({ ...p }));
  const total = groups.size;
  let done = 0;

  for (const [key, list] of groups) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const [zStr, xStr, yStr] = key.split("/");
    const tile = await fetchTerrariumTile(
      Number(zStr),
      Number(xStr),
      Number(yStr)
    );
    for (const { index, px, py } of list) {
      const clampedPx = Math.min(TILE_SIZE - 1, Math.max(0, px));
      const clampedPy = Math.min(TILE_SIZE - 1, Math.max(0, py));
      const elev = tile[clampedPy * TILE_SIZE + clampedPx];
      if (Number.isFinite(elev)) {
        result[index] = { ...result[index], ele: elev };
      }
    }
    done++;
    options?.onProgress?.({ done, total });
  }

  return result;
}
