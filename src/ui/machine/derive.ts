import type { AppMode, EditTool } from "../../lib/types";
import type { UiState } from "./types";

/** Thin legacy mapping so existing components keep working during migration. */
export function deriveLegacyMode(screen: UiState): AppMode {
  switch (screen.kind) {
    case "georef":
      return "georef";
    case "createWizard":
      return screen.step === "georef" ? "georef" : "edit";
    case "editPlan":
    case "editComment":
    case "chooseEdit":
    case "chooseComment":
    case "project":
    case "empty":
      return "edit";
    case "review":
    case "layers":
    case "playback":
      return "view";
    default:
      return "view";
  }
}

export function deriveLegacyEditTool(screen: UiState): EditTool {
  switch (screen.kind) {
    case "editPlan":
      return "plan";
    case "editComment":
    case "chooseComment":
      return "comment";
    case "empty":
    case "createWizard":
    case "project":
    case "georef":
    case "chooseEdit":
      return "setup";
    default:
      return "setup";
  }
}

/** Whether review chrome (playback / danmaku / charts) should show. */
export function isReviewChrome(screen: UiState): boolean {
  return (
    screen.kind === "review" ||
    screen.kind === "layers" ||
    screen.kind === "playback" ||
    screen.kind === "chooseEdit" ||
    screen.kind === "chooseComment" ||
    screen.kind === "editComment"
  );
}

/** Reading the race (not placing/editing comments or plans). */
export function isReviewReadonly(screen: UiState): boolean {
  return (
    screen.kind === "review" ||
    screen.kind === "layers" ||
    screen.kind === "playback"
  );
}

export function isEditingPlan(screen: UiState): boolean {
  return screen.kind === "editPlan";
}

export function isEditingComment(screen: UiState): boolean {
  return screen.kind === "editComment";
}

export function isGeorefActive(screen: UiState): boolean {
  return (
    screen.kind === "georef" ||
    (screen.kind === "createWizard" && screen.step === "georef")
  );
}
