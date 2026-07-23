import { useUiStore } from "../../store/uiStore";
import { ChooseCommentMenu, ChooseEditMenu } from "./ChooseMenus";
import { CreateWizard } from "./CreateWizard";
import { EditCommentBar } from "./EditCommentBar";
import { EditPlanBar } from "./EditPlanBar";
import { EmptyProject } from "./EmptyProject";
import { GeorefBar } from "./GeorefBar";
import { LayersPanel } from "./LayersPanel";
import { PlaybackPanel } from "./PlaybackPanel";
import { ProjectPanel } from "./ProjectPanel";
import { ReviewChrome } from "./ReviewChrome";

/** Wires Review-hub chrome, panels, tools from UiState.kind. */
export function AppShell() {
  const kind = useUiStore((s) => s.screen.kind);

  return (
    <>
      {kind === "empty" && <EmptyProject />}
      {kind === "createWizard" && <CreateWizard />}
      <ReviewChrome />
      {kind === "project" && <ProjectPanel />}
      {kind === "layers" && <LayersPanel />}
      {kind === "playback" && <PlaybackPanel />}
      {kind === "chooseEdit" && <ChooseEditMenu />}
      {kind === "chooseComment" && <ChooseCommentMenu />}
      {kind === "editPlan" && <EditPlanBar />}
      {kind === "editComment" && <EditCommentBar />}
      {kind === "georef" && <GeorefBar />}
    </>
  );
}
