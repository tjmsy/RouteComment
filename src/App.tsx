import { MapView } from "./components/MapView";
import { Toolbar } from "./components/Toolbar";
import { AnimationControls } from "./components/AnimationControls";
import "./App.css";

export default function App() {
  return (
    <div className="app">
      <Toolbar />
      <main className="main">
        <MapView />
        <AnimationControls />
      </main>
    </div>
  );
}
