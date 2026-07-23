import { useEffect } from "react";
import { MapView } from "./components/MapView";
import { Toolbar } from "./components/Toolbar";
import { AnimationControls } from "./components/AnimationControls";
import { DanmakuOverlay } from "./components/DanmakuOverlay";
import { TrackProfileCharts } from "./components/TrackProfileCharts";
import { CommentPanel } from "./components/CommentPanel";
import { useMobileLayout } from "./hooks/useMobileLayout";
import { MOBILE_MQ, MOBILE_PROFILE_HEIGHT_PX } from "./lib/mobile";
import { useUiStore } from "./store/uiStore";
import "./App.css";

/** Apply phone defaults when entering the mobile breakpoint. */
function useMobileShellDefaults() {
  const setToolbarCollapsed = useUiStore((s) => s.setToolbarCollapsed);
  const setProfilePanelHeightPx = useUiStore((s) => s.setProfilePanelHeightPx);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const apply = (mobile: boolean) => {
      if (!mobile) return;
      setToolbarCollapsed(true);
      setProfilePanelHeightPx(MOBILE_PROFILE_HEIGHT_PX);
    };
    apply(mq.matches);
    const onChange = () => apply(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [setToolbarCollapsed, setProfilePanelHeightPx]);
}

export default function App() {
  const mobile = useMobileLayout();
  useMobileShellDefaults();

  return (
    <div className="app">
      <Toolbar />
      <main className="main">
        <div className="main-map">
          <MapView />
          <DanmakuOverlay />
        </div>
        <TrackProfileCharts />
        <AnimationControls />
        {mobile && (
          <div className="comment-sheet-host">
            <CommentPanel variant="sheet" />
          </div>
        )}
      </main>
    </div>
  );
}
