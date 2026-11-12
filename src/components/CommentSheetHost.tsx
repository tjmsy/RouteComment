import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";

type Props = {
  children: ReactNode;
};

/**
 * Host for caption CommentPanel: sits above bottom chrome and pads for the
 * on-screen keyboard. No map dimming — map stays interactive for marker drag.
 */
export function CommentSheetHost({ children }: Props) {
  const expandedCommentIds = useUiStore((s) => s.expandedCommentIds);
  const screen = useUiStore((s) => s.screen);
  const comments = useProjectStore((s) => s.project.comments);
  const [keyboardPad, setKeyboardPad] = useState(0);
  const [bottomChrome, setBottomChrome] = useState(0);
  const hostRef = useRef<HTMLDivElement>(null);

  const activeId = expandedCommentIds[expandedCommentIds.length - 1] ?? null;
  const active = comments.find((c) => c.id === activeId) ?? null;
  const open = active?.kind === "danmaku";

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      const overlap = Math.max(
        0,
        window.innerHeight - vv.height - vv.offsetTop
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

  // Expose sheet inset on .main so StatusToast can sit above the sheet.
  useEffect(() => {
    const main = hostRef.current?.closest(".main");
    if (!(main instanceof HTMLElement)) return;
    if (open) {
      main.style.setProperty("--sheet-bottom", `${bottomChrome}px`);
      main.style.setProperty("--sheet-keyboard-pad", `${keyboardPad}px`);
      main.dataset.commentSheet = "open";
    } else {
      main.style.removeProperty("--sheet-bottom");
      main.style.removeProperty("--sheet-keyboard-pad");
      delete main.dataset.commentSheet;
    }
    return () => {
      main.style.removeProperty("--sheet-bottom");
      main.style.removeProperty("--sheet-keyboard-pad");
      delete main.dataset.commentSheet;
    };
  }, [open, bottomChrome, keyboardPad]);

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
      {open && <div className="comment-sheet-lift">{children}</div>}
    </div>
  );
}
