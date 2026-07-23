/** Matches `@media (max-width: 800px)` in App.css */
export const MOBILE_MQ = "(max-width: 800px)";

export function isMobileViewport(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches
  );
}

export function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/** Default profile panel height on phones (keeps the map usable). */
export const MOBILE_PROFILE_HEIGHT_PX = 120;

/** Max profile height as a fraction of the viewport on phones. */
export const MOBILE_PROFILE_MAX_HEIGHT_RATIO = 0.35;

/** Screen-pixel track hit radius; larger for fingers. */
export function trackHitPx(base = 28): number {
  return isCoarsePointer() ? Math.max(base, 48) : base;
}

export function trackDragHitPx(base = 40): number {
  return isCoarsePointer() ? Math.max(base, 56) : base;
}

/** "Tap" on touch-first devices, otherwise "Click". */
export function pointerVerb(): "Tap" | "Click" {
  return isCoarsePointer() ? "Tap" : "Click";
}
