import { useUiStore } from "../../store/uiStore";
import { ChooseEditMenu } from "./ChooseMenus";
import { CreateWizard } from "./CreateWizard";
import { EditCommentBar } from "./EditCommentBar";
import { EditPlanBar } from "./EditPlanBar";
import { EmptyProject } from "./EmptyProject";
import { FollowRangeConfirmBar } from "./FollowRangeConfirmBar";
import { GeorefBar } from "./GeorefBar";
import { LayersPanel } from "./LayersPanel";
import { ProjectPanel } from "./ProjectPanel";
import { ReviewChrome } from "./ReviewChrome";

/**
 * Wires Review-hub chrome, panels, tools from UiState.kind.
 * Single overlay root so fragments never become CSS-grid siblings of <main>.
 */
export function AppShell() {
  const kind = useUiStore((s) => s.screen.kind);

  return (
    <div className="app-shell-overlay" aria-live="polite">
      {kind === "empty" && <EmptyProject />}
      {kind === "createWizard" && <CreateWizard />}
      <ReviewChrome />
      {kind === "project" && <ProjectPanel />}
      {kind === "layers" && <LayersPanel />}
      {kind === "chooseEdit" && <ChooseEditMenu />}
      {kind === "editPlan" && <EditPlanBar />}
      {kind === "editComment" && (
        <>
          <EditCommentBar />
          <FollowRangeConfirmBar />
        </>
      )}
      {kind === "georef" && <GeorefBar />}
    </div>
  );
}
