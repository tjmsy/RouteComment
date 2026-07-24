import { useUiStore } from "../../store/uiStore";
import { t } from "../../i18n";
import { PanelHost } from "./PanelHost";

export function ChooseEditMenu() {
  const dispatch = useUiStore((s) => s.dispatch);

  return (
    <PanelHost title={t("choose.edit")} role="action" side="right">
      <div className="btn-row btn-row-stack">
        <button
          type="button"
          className="setup-primary"
          onClick={() => dispatch({ type: "SELECT_PLAN" })}
        >
          {t("choose.plan")}
        </button>
        <button
          type="button"
          className="setup-primary"
          onClick={() =>
            dispatch({ type: "SELECT_COMMENT_KIND", kind: "follow" })
          }
        >
          {t("commentTool.follow")}
        </button>
        <button
          type="button"
          className="setup-primary"
          onClick={() =>
            dispatch({ type: "SELECT_COMMENT_KIND", kind: "map" })
          }
        >
          {t("commentTool.map")}
        </button>
        <button
          type="button"
          className="setup-primary"
          onClick={() =>
            dispatch({ type: "SELECT_COMMENT_KIND", kind: "danmaku" })
          }
        >
          {t("commentTool.danmaku")}
        </button>
      </div>
    </PanelHost>
  );
}
