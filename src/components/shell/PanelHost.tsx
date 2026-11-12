import type { ReactNode } from "react";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { useUiStore } from "../../store/uiStore";
import { t } from "../../i18n";

type Props = {
  title: string;
  children: ReactNode;
  /** Pinned below the scroll body (e.g. Save / Load). Always visible. */
  footer?: ReactNode;
  /** information → 閉じる; action → 閉じる after pick often handled by parent */
  role?: "information" | "action";
  /** Desktop dock side (Project / Layers / Edit open on the right). */
  side?: "left" | "right";
};

/** Shared panel host: bottom sheet on mobile, side panel on desktop. */
export function PanelHost({
  title,
  children,
  footer,
  role = "information",
  side = "left",
}: Props) {
  const mobile = useMobileLayout();
  const dispatch = useUiStore((s) => s.dispatch);

  return (
    <>
      <button
        type="button"
        className="panel-host-backdrop"
        aria-label={t("panel.close")}
        onClick={() => dispatch({ type: "DISMISS" })}
      />
      <aside
        className={`panel-host${mobile ? " panel-host--sheet" : ` panel-host--side panel-host--${side}`}${
          role === "action" ? " panel-host--action" : ""
        }`}
      >
        <header className="panel-host-header">
          <h2>{title}</h2>
          <button
            type="button"
            className="btn-dismiss"
            onClick={() => dispatch({ type: "DISMISS" })}
          >
            {t("panel.close")}
          </button>
        </header>
        <div className="panel-host-body">{children}</div>
        {footer != null && <div className="panel-host-footer">{footer}</div>}
      </aside>
    </>
  );
}
