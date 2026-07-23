import { transitions } from "./transitions";
import type { UiEvent, UiState, WizardStep } from "./types";

const WIZARD_ORDER: WizardStep[] = ["gpx", "map", "georef"];

function nextWizardStep(step: WizardStep): WizardStep | "done" {
  const i = WIZARD_ORDER.indexOf(step);
  if (i < 0 || i >= WIZARD_ORDER.length - 1) return "done";
  return WIZARD_ORDER[i + 1]!;
}

function stateForKind(kind: UiState["kind"]): UiState {
  if (kind === "createWizard") return { kind: "createWizard", step: "gpx" };
  return { kind } as UiState;
}

/**
 * Pure UI screen-mode reducer. Side effects (status text, playback stop)
 * belong in the store wrapper, not here.
 */
export function reduceUiState(state: UiState, event: UiEvent): UiState {
  // Flow: create wizard steps
  if (state.kind === "createWizard") {
    switch (event.type) {
      case "WIZARD_NEXT":
      case "WIZARD_SKIP": {
        const next = nextWizardStep(state.step);
        if (next === "done") return { kind: "review" };
        // After map skip/next, georef only makes sense with a map — still allow step;
        // UI may skip georef via WIZARD_DONE / WIZARD_SKIP from georef.
        return { kind: "createWizard", step: next };
      }
      case "WIZARD_DONE":
        return { kind: "review" };
      case "CLEAR_PROJECT":
        return { kind: "empty" };
      default:
        break;
    }
  }

  if (event.type === "CLEAR_PROJECT") {
    return { kind: "empty" };
  }

  if (event.type === "LOAD_ZIP_SUCCESS") {
    return { kind: "review" };
  }

  if (event.type === "START_CREATE" && state.kind === "empty") {
    return { kind: "createWizard", step: "gpx" };
  }

  // Allow returning to review from anywhere via TOOL_DONE / GEOREF_DONE / DISMISS when table says so
  const table = transitions[state.kind] as
    | Partial<Record<UiEvent["type"], UiState["kind"]>>
    | undefined;
  const nextKind = table?.[event.type];
  if (nextKind) {
    return stateForKind(nextKind);
  }

  return state;
}
