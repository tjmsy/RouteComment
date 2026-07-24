import { useUiStore } from "../../store/uiStore";

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
    useUiStore.getState().setStatusMessage("Follow range cancelled.");
  };

  if (!draft) {
    return (
      <div className="follow-range-confirm-bar" role="status">
        <p className="follow-range-confirm-hint">Re-selecting range…</p>
        <div className="follow-range-confirm-actions">
          <button type="button" className="btn-dismiss" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="follow-range-confirm-bar" role="status">
      <p className="follow-range-confirm-hint">Confirm range</p>
      <div className="follow-range-confirm-actions">
        <button type="button" onClick={() => redoFollowDraft()}>
          Redo
        </button>
        <button
          type="button"
          className="btn-done"
          onClick={() => confirmFollowDraft()}
        >
          Confirm
        </button>
        <button type="button" className="btn-dismiss" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
