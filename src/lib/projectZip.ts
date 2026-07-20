import JSZip from "jszip";
import type { OMapPose, ProjectData } from "./types";
import {
  createEmptyProject,
  normalizeComment,
  normalizeRoutePlan,
} from "./types";
import { parseGpx, withTimeOffsets } from "./gpx";

export type LoadedProject = {
  data: ProjectData;
  mapImageBlob: Blob | null;
  mapImageUrl: string | null;
};

function isPose(v: unknown): v is OMapPose {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return (
    typeof p.lng === "number" &&
    typeof p.lat === "number" &&
    typeof p.bearing === "number" &&
    typeof p.widthM === "number" &&
    typeof p.heightM === "number"
  );
}

export async function saveProjectZip(
  data: ProjectData,
  mapImageBlob: Blob | null,
): Promise<Blob> {
  const zip = new JSZip();

  const serializable: ProjectData = {
    ...data,
    mapImage: mapImageBlob
      ? { fileName: data.mapImage?.fileName ?? guessImageName(mapImageBlob) }
      : null,
  };

  zip.file("project.json", JSON.stringify(serializable, null, 2));

  if (mapImageBlob && serializable.mapImage) {
    zip.file(serializable.mapImage.fileName, mapImageBlob);
  }

  if (data.track.points.length > 0) {
    zip.file("track.gpx", trackToGpx(data));
  }

  return zip.generateAsync({ type: "blob" });
}

export async function loadProjectZip(file: Blob): Promise<LoadedProject> {
  const zip = await JSZip.loadAsync(file);
  const projectFile = zip.file("project.json");
  if (!projectFile) {
    throw new Error("project.json not found in ZIP");
  }

  const jsonText = await projectFile.async("string");
  const parsed = JSON.parse(jsonText) as Partial<ProjectData> & {
    georef?: { pose?: unknown; controlPoints?: unknown };
  };
  const data = normalizeProject(parsed);

  let mapImageBlob: Blob | null = null;
  let mapImageUrl: string | null = null;

  if (data.mapImage?.fileName) {
    const imgFile = zip.file(data.mapImage.fileName);
    if (imgFile) {
      mapImageBlob = await imgFile.async("blob");
      mapImageUrl = URL.createObjectURL(mapImageBlob);
    }
  }

  const gpxFile = zip.file("track.gpx");
  if (gpxFile && data.track.points.length === 0) {
    const gpxText = await gpxFile.async("string");
    data.track.points = parseGpx(gpxText);
  } else {
    data.track.points = withTimeOffsets(data.track.points);
  }

  return { data, mapImageBlob, mapImageUrl };
}

function normalizeProject(
  parsed: Partial<ProjectData> & {
    georef?: { pose?: unknown; controlPoints?: unknown };
  },
): ProjectData {
  const base = createEmptyProject(parsed.name ?? "Untitled");
  const pose = isPose(parsed.georef?.pose) ? parsed.georef.pose : null;
  return {
    version: 1,
    name: parsed.name ?? base.name,
    mapImage: parsed.mapImage ?? null,
    georef: { pose },
    track: { points: parsed.track?.points ?? [] },
    routePlans:
      parsed.routePlans && parsed.routePlans.length > 0
        ? parsed.routePlans.map((p, i) => normalizeRoutePlan(p, i))
        : base.routePlans,
    comments: (parsed.comments ?? []).map((c) =>
      normalizeComment(c as Parameters<typeof normalizeComment>[0]),
    ),
  };
}

function guessImageName(blob: Blob): string {
  if (blob.type.includes("png")) return "map.png";
  if (blob.type.includes("webp")) return "map.webp";
  return "map.jpg";
}

function trackToGpx(data: ProjectData): string {
  const pts = data.track.points
    .map((p) => {
      const time = p.time ? `<time>${escapeXml(p.time)}</time>` : "";
      return `<trkpt lat="${p.lat}" lon="${p.lng}">${time}</trkpt>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RouteComment">
  <trk>
    <name>${escapeXml(data.name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
