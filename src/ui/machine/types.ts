/** Screen-mode only. Display/playback/selection live elsewhere. */

export type WizardStep = "gpx" | "map" | "georef";

export type UiState =
  | { kind: "empty" }
  | { kind: "createWizard"; step: WizardStep }
  | { kind: "review" }
  | { kind: "project" }
  | { kind: "layers" }
  | { kind: "playback" }
  | { kind: "chooseEdit" }
  | { kind: "editPlan" }
  | { kind: "editComment" }
  | { kind: "georef" };

export type UiKind = UiState["kind"];

export type CommentKindChoice = "map" | "follow" | "danmaku";

export type UiEvent =
  | { type: "START_CREATE" }
  | { type: "LOAD_ZIP_SUCCESS" }
  | { type: "CLEAR_PROJECT" }
  | { type: "WIZARD_NEXT" }
  | { type: "WIZARD_SKIP" }
  | { type: "WIZARD_BACK" }
  | { type: "WIZARD_DONE" }
  | { type: "OPEN_PROJECT" }
  | { type: "OPEN_LAYERS" }
  | { type: "OPEN_PLAYBACK" }
  | { type: "OPEN_EDIT_MENU" }
  | { type: "DISMISS" }
  | { type: "START_GEOREF" }
  | { type: "SELECT_PLAN" }
  | { type: "SELECT_COMMENT_KIND"; kind: CommentKindChoice }
  | { type: "TOOL_DONE" }
  | { type: "GEOREF_DONE" };

export const INITIAL_UI_STATE: UiState = { kind: "empty" };
