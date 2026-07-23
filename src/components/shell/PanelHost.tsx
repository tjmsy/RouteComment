import type { ReactNode } from "react";
import { useMobileLayout } from "../../hooks/useMobileLayout";
import { useUiStore } from "../../store/uiStore";

type Props = {
  title: string;
  children: ReactNode;
  /** information → 閉じる; action → 閉じる after pick often handled by parent */
  role?: "information" | "action";
  /** Desktop dock side (Project opens near the Project button). */
  side?: "left" | "right";
};

/** Shared panel host: bottom sheet on mobile, side panel on desktop. */
export function PanelHost({
  title,
  children,
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
        aria-label="閉じる"
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
            閉じる
          </button>
        </header>
        <div className="panel-host-body">{children}</div>
      </aside>
    </>
  );
}
