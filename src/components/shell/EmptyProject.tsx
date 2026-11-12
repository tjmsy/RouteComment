import { useProjectIO } from "../../hooks/useProjectIO";
import { useUiStore } from "../../store/uiStore";
import { t } from "../../i18n";

export function EmptyProject() {
  const dispatch = useUiStore((s) => s.dispatch);
  const { zipInputRef, hiddenInputs } = useProjectIO();

  return (
    <div className="empty-project">
      <p className="empty-project-lead">{t("empty.lead")}</p>
      <div className="empty-project-actions">
        <button
          type="button"
          className="empty-cta"
          onClick={() => zipInputRef.current?.click()}
        >
          {t("empty.loadZip")}
        </button>
        <button
          type="button"
          className="empty-cta"
          onClick={() => dispatch({ type: "START_CREATE" })}
        >
          {t("empty.createProject")}
        </button>
      </div>
      {hiddenInputs}
    </div>
  );
}
