import { useUiStore } from "../../store/uiStore";
import { t } from "../../i18n";

/** Thin action bar while a follow range draft awaits Confirm / Redo. */
export function FollowRangeConfirmBar() {
  const draft = useUiStore((s) => s.followDraftRange);
  const targetId = useUiStore((s) => s.followRangeTargetId);
  const confirmFollowDraft = useUiStore((s) => s.confirmFollowDraft);
  const redoFollowDraft = useUiStore((s) => s.redoFollowDraft);
  const clearFollowRangeSession = useUiStore((s) => s.clearFollowRangeSession);
  const setCommentExpanded = useUiStore((s) => s.setCommentExpanded);

  if (!draft && !targetId) return null;

  const cancel = () => {
    const restoreId = draft?.targetId ?? targetId;
    clearFollowRangeSession();
    if (restoreId) setCommentExpanded(restoreId, true);
    useUiStore.getState().setStatusMessage(t("followBar.cancelled"));
  };

  if (!draft) {
    return (
      <div className="follow-range-confirm-bar" role="status">
        <p className="follow-range-confirm-hint">
          {t("followBar.reselecting")}
        </p>
        <div className="follow-range-confirm-actions">
          <button type="button" className="btn-dismiss" onClick={cancel}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="follow-range-confirm-bar" role="status">
      <p className="follow-range-confirm-hint">
        {t("followBar.dragConfirm")}
      </p>
      <div className="follow-range-confirm-actions">
        <button type="button" onClick={() => redoFollowDraft()}>
          {t("common.redo")}
        </button>
        <button
          type="button"
          className="btn-done"
          onClick={() => confirmFollowDraft()}
        >
          {t("common.confirm")}
        </button>
        <button type="button" className="btn-dismiss" onClick={cancel}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
