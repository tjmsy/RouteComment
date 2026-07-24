import type { UiEvent, UiKind } from "./types";

/**
 * Source of truth for simple kind → kind transitions.
 * Payload / multi-step flow (createWizard) is handled in reduce.ts.
 */
export const transitions: Record<
  UiKind,
  Partial<Record<UiEvent["type"], UiKind>>
> = {
  review: {
    OPEN_PROJECT: "project",
    OPEN_LAYERS: "layers",
    OPEN_PLAYBACK: "playback",
    OPEN_EDIT_MENU: "chooseEdit",
    SELECT_PLAN: "editPlan",
    SELECT_COMMENT_KIND: "editComment",
  },
  project: {
    DISMISS: "review",
    START_GEOREF: "georef",
  },
  layers: { DISMISS: "review" },
  playback: { DISMISS: "review" },
  chooseEdit: {
    DISMISS: "review",
    SELECT_PLAN: "editPlan",
    SELECT_COMMENT_KIND: "editComment",
  },
  editPlan: { TOOL_DONE: "review" },
  editComment: { TOOL_DONE: "review" },
  georef: { GEOREF_DONE: "review" },
  empty: {
    START_CREATE: "createWizard",
    LOAD_ZIP_SUCCESS: "review",
  },
  createWizard: {},
};

/** Flat list of [fromKind, eventType, toKind] for exhaustive tests. */
export function listSimpleTransitions(): Array<{
  from: UiKind;
  event: UiEvent["type"];
  to: UiKind;
}> {
  const rows: Array<{ from: UiKind; event: UiEvent["type"]; to: UiKind }> = [];
  for (const from of Object.keys(transitions) as UiKind[]) {
    const map = transitions[from];
    for (const event of Object.keys(map) as UiEvent["type"][]) {
      const to = map[event];
      if (to) rows.push({ from, event, to });
    }
  }
  return rows;
}
