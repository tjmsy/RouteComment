/** Matches `@media (max-width: 800px)` in App.css */
export const MOBILE_MQ = "(max-width: 800px)";

export function isMobileViewport(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches
  );
}

/** Default profile panel height on phones (keeps the map usable). */
export const MOBILE_PROFILE_HEIGHT_PX = 120;

/** Max profile height as a fraction of the viewport on phones. */
export const MOBILE_PROFILE_MAX_HEIGHT_RATIO = 0.35;
