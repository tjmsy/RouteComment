import { describe, expect, it } from "vitest";
import { reduceUiState } from "./reduce";
import { listSimpleTransitions, transitions } from "./transitions";
import type { UiEvent, UiState } from "./types";
import { INITIAL_UI_STATE } from "./types";

describe("listSimpleTransitions", () => {
  it("covers every non-empty entry in the transitions table", () => {
    const rows = listSimpleTransitions();
    expect(rows.length).toBeGreaterThan(0);
    for (const { from, event, to } of rows) {
      const map = transitions[from] as Record<string, string | undefined>;
      expect(map[event]).toBe(to);
    }
  });

  it("applies each table row via reduceUiState", () => {
    for (const { from, event, to } of listSimpleTransitions()) {
      const state = stateForKind(from);
      const next = reduceUiState(state, { type: event } as UiEvent);
      expect(next.kind).toBe(to);
    }
  });
});

describe("reduceUiState flow", () => {
  it("starts empty", () => {
    expect(INITIAL_UI_STATE).toEqual({ kind: "empty" });
  });

  it("empty → createWizard → steps → review", () => {
    let s: UiState = { kind: "empty" };
    s = reduceUiState(s, { type: "START_CREATE" });
    expect(s).toEqual({ kind: "createWizard", step: "gpx" });
    s = reduceUiState(s, { type: "WIZARD_NEXT" });
    expect(s).toEqual({ kind: "createWizard", step: "map" });
    s = reduceUiState(s, { type: "WIZARD_SKIP" });
    expect(s).toEqual({ kind: "review" });
  });

  it("wizard: skip map finishes without georef; back from georef", () => {
    let s: UiState = { kind: "createWizard", step: "map" };
    s = reduceUiState(s, { type: "WIZARD_NEXT" });
    expect(s).toEqual({ kind: "createWizard", step: "georef" });
    s = reduceUiState(s, { type: "WIZARD_BACK" });
    expect(s).toEqual({ kind: "createWizard", step: "map" });
  });

  it("empty → LOAD_ZIP_SUCCESS → review", () => {
    const s = reduceUiState(
      { kind: "empty" },
      { type: "LOAD_ZIP_SUCCESS" },
    );
    expect(s).toEqual({ kind: "review" });
  });

  it("hub: review → project → georef → review", () => {
    let s: UiState = { kind: "review" };
    s = reduceUiState(s, { type: "OPEN_PROJECT" });
    expect(s.kind).toBe("project");
    s = reduceUiState(s, { type: "START_GEOREF" });
    expect(s.kind).toBe("georef");
    s = reduceUiState(s, { type: "GEOREF_DONE" });
    expect(s.kind).toBe("review");
  });

  it("hub: chooseEdit → editPlan → TOOL_DONE", () => {
    let s: UiState = { kind: "review" };
    s = reduceUiState(s, { type: "OPEN_EDIT_MENU" });
    s = reduceUiState(s, { type: "SELECT_PLAN" });
    expect(s.kind).toBe("editPlan");
    s = reduceUiState(s, { type: "TOOL_DONE" });
    expect(s.kind).toBe("review");
  });

  it("unknown event is a no-op", () => {
    const s: UiState = { kind: "review" };
    expect(reduceUiState(s, { type: "TOOL_DONE" })).toEqual(s);
  });

  it("CLEAR_PROJECT → empty from review", () => {
    expect(
      reduceUiState({ kind: "review" }, { type: "CLEAR_PROJECT" }),
    ).toEqual({ kind: "empty" });
  });
});

function stateForKind(kind: UiState["kind"]): UiState {
  if (kind === "createWizard") return { kind: "createWizard", step: "gpx" };
  return { kind } as UiState;
}
