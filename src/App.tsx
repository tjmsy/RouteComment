import { MapView } from "./components/MapView";
import { Toolbar } from "./components/Toolbar";
import { AnimationControls } from "./components/AnimationControls";
import { DanmakuOverlay } from "./components/DanmakuOverlay";
import { TrackProfileCharts } from "./components/TrackProfileCharts";
import "./App.css";

export default function App() {
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
      </main>
    </div>
  );
}
