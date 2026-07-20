import type { OMapPose } from "./omapPose";

export type { OMapPose };

export type TrackPoint = {
  lng: number;
  lat: number;
  time?: string;
  timeOffsetMs?: number;
};

export type RoutePlan = {
  id: string;
  name: string;
  coordinates: [number, number][]; // lng, lat
  visible: boolean;
};

export type Comment = {
  id: string;
  lng: number;
  lat: number;
  text: string;
  /** Track-relative time for animation sync (optional). */
  timeOffsetMs?: number;
};

export type ProjectData = {
  version: 1;
  name: string;
  mapImage: { fileName: string } | null;
  georef: {
    /** Geographic pose of the map image overlay (streetview-o style). */
    pose: OMapPose | null;
  };
  track: { points: TrackPoint[] };
  routePlans: RoutePlan[];
  comments: Comment[];
};

export type AppMode = "view" | "georef" | "plan" | "comment";

export type ImageSourceCoordinates = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

export function createEmptyProject(name = "Untitled"): ProjectData {
  return {
    version: 1,
    name,
    mapImage: null,
    georef: { pose: null },
    track: { points: [] },
    routePlans: [
      {
        id: crypto.randomUUID(),
        name: "Plan A",
        coordinates: [],
        visible: true,
      },
    ],
    comments: [],
  };
}
