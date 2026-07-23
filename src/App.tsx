import { useEffect } from "react";
import { MapView } from "./components/MapView";
import { AppShell } from "./components/shell/AppShell";
import { AnimationControls } from "./components/AnimationControls";
import { DanmakuOverlay } from "./components/DanmakuOverlay";
import { TrackProfileCharts } from "./components/TrackProfileCharts";
import { CommentPanel } from "./components/CommentPanel";
import { CommentSheetHost } from "./components/CommentSheetHost";
import { StatusToast } from "./components/StatusToast";
import { useMobileLayout } from "./hooks/useMobileLayout";
import { MOBILE_MQ, MOBILE_PROFILE_HEIGHT_PX } from "./lib/mobile";
import { useUiStore } from "./store/uiStore";
import { isGeorefActive, isReviewChrome } from "./ui/machine";
import "./App.css";

function useMobileShellDefaults() {
  const setProfilePanelHeightPx = useUiStore((s) => s.setProfilePanelHeightPx);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const apply = (mobile: boolean) => {
      if (!mobile) return;
      setProfilePanelHeightPx(MOBILE_PROFILE_HEIGHT_PX);
    };
    apply(mq.matches);
    const onChange = () => apply(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setProfilePanelHeightPx]);
}

export default function App() {
  const mobile = useMobileLayout();
  useMobileShellDefaults();
  const screen = useUiStore((s) => s.screen);
  /** One MapView for wizard + review so camera/overlay survive WIZARD_DONE. */
  const showMap = screen.kind !== "empty";
  const showReviewChrome = isReviewChrome(screen);
  const showPlayback =
    showReviewChrome &&
    screen.kind !== "editPlan" &&
    screen.kind !== "chooseEdit";
  const showProfile =
    showReviewChrome &&
    (screen.kind === "review" ||
      screen.kind === "layers" ||
      screen.kind === "playback" ||
      screen.kind === "editComment" ||
      screen.kind === "chooseComment");
  const wizardGeoref =
    screen.kind === "createWizard" && screen.step === "georef";

  return (
    <div className="app app--hub">
      <AppShell />
      {showMap && (
        <main
          className={`main${screen.kind === "createWizard" ? " main--wizard" : ""}`}
        >
          <div className="main-map">
            <MapView />
            {!isGeorefActive(screen) && !wizardGeoref && <DanmakuOverlay />}
            <StatusToast />
          </div>
          {showProfile && <TrackProfileCharts />}
          {showPlayback && <AnimationControls />}
          {mobile && (
            <CommentSheetHost>
              <CommentPanel variant="sheet" />
            </CommentSheetHost>
          )}
        </main>
      )}
    </div>
  );
}
