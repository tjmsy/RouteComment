import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { isEditingComment } from "../ui/machine";

type Props = {
  children: ReactNode;
};

/**
 * Mobile host for CommentPanel: backdrop dismiss, sits above bottom chrome,
 * and pads for the on-screen keyboard via visualViewport.
 */
export function CommentSheetHost({ children }: Props) {
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const clearExpandedComments = useUiStore((s) => s.clearExpandedComments);
  const screen = useUiStore((s) => s.screen);
  const commentTool = useUiStore((s) => s.commentTool);
  const followRangeStartMs = useUiStore((s) => s.followRangeStartMs);
  const followDraftRange = useUiStore((s) => s.followDraftRange);
  const followRangeTargetId = useUiStore((s) => s.followRangeTargetId);
  const comments = useProjectStore((s) => s.project.comments);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [bottomChrome, setBottomChrome] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);

  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;
  const active = comments.find((c) => c.id === activeId) ?? null;

  /**
   * Keep the map free while picking or confirming a follow range.
   * Map + Follow comments edit on the bubble itself — never cover with a sheet.
   */
  const pickingFollow =
    isEditingComment(screen) &&
    commentTool === "follow" &&
    (followRangeStartMs != null ||
      followDraftRange != null ||
      followRangeTargetId != null);

  const open =
    expandedCommentIds.length > 0 &&
    !pickingFollow &&
    active?.kind !== "map" &&
    !(active?.kind === "follow" && isEditingComment(screen));

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const overlap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop,
      );
      setKeyboardPad(overlap);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  useEffect(() => {
    const main = hostRef.current?.closest(".main");
    if (!main) return;
    const measure = () => {
      const anim = main.querySelector(".animation-bar");
      const profile = main.querySelector(".profile-charts");
      let h = 0;
      if (
        anim instanceof HTMLElement &&
        getComputedStyle(anim).display !== "none"
      ) {
        h += anim.offsetHeight;
      }
      if (
        profile instanceof HTMLElement &&
        getComputedStyle(profile).display !== "none"
      ) {
        h += profile.offsetHeight;
      }
      setBottomChrome(h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    const anim = main.querySelector(".animation-bar");
    const profile = main.querySelector(".profile-charts");
    if (anim) ro.observe(anim);
    if (profile) ro.observe(profile);
    return () => ro.disconnect();
  }, [screen.kind, open]);

  return (
    <div
      ref={hostRef}
      className={
        open
          ? "comment-sheet-host comment-sheet-host--open"
          : "comment-sheet-host"
      }
      hidden={!open}
      style={
        {
          "--sheet-bottom": `${bottomChrome}px`,
          "--sheet-keyboard-pad": `${keyboardPad}px`,
        } as CSSProperties
      }
    >
      {open && (
        <>
          <button
            type="button"
            className="comment-sheet-backdrop"
            aria-label="Close comment"
            onClick={() => clearExpandedComments()}
          />
          <div className="comment-sheet-lift">{children}</div>
        </>
      )}
    </div>
  );
}
