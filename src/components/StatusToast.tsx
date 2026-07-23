import { useEffect, useState } from "react";
import { useUiStore } from "../store/uiStore";

/** Floating status banner over the map (hub shell). */
export function StatusToast() {
  const statusMessage = useUiStore((s) => s.statusMessage);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const [visible, setVisible] = useState(false);
  const [shownMessage, setShownMessage] = useState("");

  useEffect(() => {
    if (!statusMessage) {
      setVisible(false);
      return;
    }
    setShownMessage(statusMessage);
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(t);
  }, [statusMessage]);

  if (!visible || !shownMessage) return null;

  return (
    <div className="status-toast" role="status">
      <p className="status-toast-text">{shownMessage}</p>
      <button
        type="button"
        className="status-toast-dismiss"
        aria-label="Dismiss"
        onClick={() => {
          setVisible(false);
          setStatusMessage("");
        }}
      >
        ×
      </button>
    </div>
  );
}
