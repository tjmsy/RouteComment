import { useEffect, useState } from "react";
import { useUiStore } from "../store/uiStore";
import { t } from "../i18n";

/** Floating status banner over the map (hub shell). */
export function StatusToast() {
  const statusMessage = useUiStore((s) => s.statusMessage);
  const setStatusMessage = useUiStore((s) => s.setStatusMessage);
  const [visible, setVisible] = useState(false);
  const [shownMessage, setShownMessage] = useState("");

  useEffect(() => {
    if (!statusMessage) {
      queueMicrotask(() => setVisible(false));
      return;
    }
    queueMicrotask(() => {
      setShownMessage(statusMessage);
      setVisible(true);
    });
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
        aria-label={t("toast.dismiss")}
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
