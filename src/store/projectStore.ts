import { create } from "zustand";
import { t } from "../i18n";
import type {
  Comment,
  OMapPose,
  ProjectData,
  RoutePlan,
  TrackPoint,
} from "../lib/types";
import { createEmptyProject, nextPlanColor } from "../lib/types";

type ProjectState = {
  project: ProjectData;
  mapImageBlob: Blob | null;
  mapImageUrl: string | null;
  mapImageSize: { width: number; height: number } | null;

  setName: (name: string) => void;
  loadProject: (
    project: ProjectData,
    mapImageBlob: Blob | null,
    mapImageUrl: string | null,
    mapImageSize: { width: number; height: number } | null
  ) => void;
  resetProject: () => void;

  setMapImage: (
    blob: Blob,
    url: string,
    fileName: string,
    size: { width: number; height: number }
  ) => void;
  clearMapImage: () => void;
  setPose: (pose: OMapPose | null) => void;

  setTrack: (points: TrackPoint[]) => void;

  setRoutePlans: (plans: RoutePlan[]) => void;
  addRoutePlan: () => string;
  removeRoutePlan: (id: string) => void;
  updateRoutePlan: (id: string, patch: Partial<RoutePlan>) => void;
  appendPlanCoordinate: (planId: string, coord: [number, number]) => void;
  updatePlanCoordinate: (
    planId: string,
    index: number,
    coord: [number, number]
  ) => void;
  insertPlanCoordinate: (
    planId: string,
    index: number,
    coord: [number, number]
  ) => void;
  removePlanCoordinate: (planId: string, index: number) => void;
  undoPlanCoordinate: (planId: string) => void;
  clearPlanCoordinates: (planId: string) => void;
  togglePlanVisible: (planId: string) => void;

  addComment: (comment: Omit<Comment, "id">) => string;
  updateComment: (id: string, patch: Partial<Comment>) => void;
  removeComment: (id: string) => void;
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: createEmptyProject(),
  mapImageBlob: null,
  mapImageUrl: null,
  mapImageSize: null,

  setName: (name) => set((s) => ({ project: { ...s.project, name } })),

  loadProject: (project, mapImageBlob, mapImageUrl, mapImageSize) =>
    set({ project, mapImageBlob, mapImageUrl, mapImageSize }),

  resetProject: () => {
    const prev = get().mapImageUrl;
    if (prev) URL.revokeObjectURL(prev);
    set({
      project: createEmptyProject(),
      mapImageBlob: null,
      mapImageUrl: null,
      mapImageSize: null,
    });
  },

  setMapImage: (blob, url, fileName, size) => {
    const prev = get().mapImageUrl;
    if (prev) URL.revokeObjectURL(prev);
    set((s) => ({
      mapImageBlob: blob,
      mapImageUrl: url,
      mapImageSize: size,
      project: {
        ...s.project,
        mapImage: { fileName },
        georef: { pose: null },
      },
    }));
  },

  clearMapImage: () => {
    const prev = get().mapImageUrl;
    if (prev) URL.revokeObjectURL(prev);
    set((s) => ({
      mapImageBlob: null,
      mapImageUrl: null,
      mapImageSize: null,
      project: {
        ...s.project,
        mapImage: null,
        georef: { pose: null },
      },
    }));
  },

  setPose: (pose) =>
    set((s) => ({
      project: { ...s.project, georef: { pose } },
    })),

  setTrack: (points) =>
    set((s) => ({
      project: { ...s.project, track: { points } },
    })),

  setRoutePlans: (plans) =>
    set((s) => ({
      project: { ...s.project, routePlans: plans },
    })),

  addRoutePlan: () => {
    const id = crypto.randomUUID();
    set((s) => {
      const plan: RoutePlan = {
        id,
        name: t("plan.defaultName"),
        coordinates: [],
        visible: true,
        color: nextPlanColor(s.project.routePlans),
        lineWidth: 3,
      };
      return {
        project: {
          ...s.project,
          routePlans: [...s.project.routePlans, plan],
        },
      };
    });
    return id;
  },

  removeRoutePlan: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        routePlans: s.project.routePlans.filter((p) => p.id !== id),
      },
    })),

  updateRoutePlan: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        routePlans: s.project.routePlans.map((p) =>
          p.id === id ? { ...p, ...patch } : p
        ),
      },
    })),

  appendPlanCoordinate: (planId, coord) =>
    set((s) => ({
      project: {
        ...s.project,
        routePlans: s.project.routePlans.map((p) =>
          p.id === planId ? { ...p, coordinates: [...p.coordinates, coord] } : p
        ),
      },
    })),

  updatePlanCoordinate: (planId, index, coord) =>
    set((s) => ({
      project: {
        ...s.project,
        routePlans: s.project.routePlans.map((p) => {
          if (p.id !== planId) return p;
          if (index < 0 || index >= p.coordinates.length) return p;
          const coordinates = p.coordinates.slice();
          coordinates[index] = coord;
          return { ...p, coordinates };
        }),
      },
    })),

  insertPlanCoordinate: (planId, index, coord) =>
    set((s) => ({
      project: {
        ...s.project,
        routePlans: s.project.routePlans.map((p) => {
          if (p.id !== planId) return p;
          const i = Math.max(0, Math.min(index, p.coordinates.length));
          const coordinates = p.coordinates.slice();
          coordinates.splice(i, 0, coord);
          return { ...p, coordinates };
        }),
      },
    })),

  removePlanCoordinate: (planId, index) =>
    set((s) => ({
      project: {
        ...s.project,
        routePlans: s.project.routePlans.map((p) => {
          if (p.id !== planId) return p;
          if (index < 0 || index >= p.coordinates.length) return p;
          return {
            ...p,
            coordinates: p.coordinates.filter((_, i) => i !== index),
          };
        }),
      },
    })),

  undoPlanCoordinate: (planId) =>
    set((s) => ({
      project: {
        ...s.project,
        routePlans: s.project.routePlans.map((p) =>
          p.id === planId
            ? { ...p, coordinates: p.coordinates.slice(0, -1) }
            : p
        ),
      },
    })),

  clearPlanCoordinates: (planId) =>
    set((s) => ({
      project: {
        ...s.project,
        routePlans: s.project.routePlans.map((p) =>
          p.id === planId ? { ...p, coordinates: [] } : p
        ),
      },
    })),

  togglePlanVisible: (planId) =>
    set((s) => ({
      project: {
        ...s.project,
        routePlans: s.project.routePlans.map((p) =>
          p.id === planId ? { ...p, visible: !p.visible } : p
        ),
      },
    })),

  addComment: (comment) => {
    const id = crypto.randomUUID();
    set((s) => ({
      project: {
        ...s.project,
        comments: [...s.project.comments, { ...comment, id }],
      },
    }));
    return id;
  },

  updateComment: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        comments: s.project.comments.map((c) =>
          c.id === id ? { ...c, ...patch } : c
        ),
      },
    })),

  removeComment: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        comments: s.project.comments.filter((c) => c.id !== id),
      },
    })),
}));
