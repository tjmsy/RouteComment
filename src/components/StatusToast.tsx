import { useEffect, useState } from "react";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { useUiStore } from "../store/uiStore";

/**
 * Floating status banner for phones when the toolbar menu is collapsed
 * (the in-toolbar status is unmounted then).
 */
export function StatusToast() {
  const mobile = useMobileLayout();
  const toolbarCollapsed = useUiStore((s) => s.toolbarCollapsed);
  const statusMessage = useUiStore((s) => s.statusMessage);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const [visible, setVisible] = useState(false);
  const [shownMessage, setShownMessage] = useState("");

  useEffect(() => {
    if (!mobile || !toolbarCollapsed || !statusMessage) {
      setVisible(false);
      return;
    }
    setShownMessage(statusMessage);
    setVisible(true);
    const t = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(t);
  }, [mobile, toolbarCollapsed, statusMessage]);

  if (!mobile || !toolbarCollapsed || !visible || !shownMessage) return null;

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
