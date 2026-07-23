import { useUiStore } from "../../store/uiStore";
import { PanelHost } from "./PanelHost";

export function PlaybackPanel() {
  const playbackSpeed = useUiStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useUiStore((s) => s.setPlaybackSpeed);
  const headingUp = useUiStore((s) => s.headingUp);
  const setHeadingUp = useUiStore((s) => s.setHeadingUp);
  const terrain3d = useUiStore((s) => s.terrain3d);
  const setTerrain3d = useUiStore((s) => s.setTerrain3d);

  return (
    <PanelHost title="Playback">
      <label className="field">
        <span>Speed</span>
        <select
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
        >
          <option value={1}>1×</option>
          <option value={5}>5×</option>
          <option value={10}>10×</option>
          <option value={30}>30×</option>
          <option value={60}>60×</option>
          <option value={120}>120×</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={headingUp}
          onChange={(e) => setHeadingUp(e.target.checked)}
        />
        Heading up
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={terrain3d}
          onChange={(e) => setTerrain3d(e.target.checked)}
        />
        Terrain 3D
      </label>
    </PanelHost>
  );
}
