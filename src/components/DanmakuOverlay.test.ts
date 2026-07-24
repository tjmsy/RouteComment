import { describe, expect, it } from "vitest";
import { shouldFireDanmaku } from "../components/DanmakuOverlay";

describe("shouldFireDanmaku", () => {
  it("fires when the playhead crosses the trigger", () => {
    expect(shouldFireDanmaku(1000, 800, 1200)).toBe(true);
    expect(shouldFireDanmaku(1000, 500, 999)).toBe(false);
  });

  it("fires on a large forward jump that skips over the trigger", () => {
    expect(shouldFireDanmaku(5000, 0, 20_000)).toBe(true);
  });

  it("fires when the playhead sits in the scroll window", () => {
    expect(shouldFireDanmaku(1000, 1000, 1500)).toBe(true);
    expect(shouldFireDanmaku(1000, 1500, 2000)).toBe(true);
    // Inclusive: paused exactly on the trigger
    expect(shouldFireDanmaku(1000, 1000, 1000)).toBe(true);
  });

  it("does not fire after the scroll window has passed without crossing", () => {
    // SCROLL_DURATION_MS = 7000 → window ends at 8000
    expect(shouldFireDanmaku(1000, 8000, 8500)).toBe(false);
  });

  it("fires when a jump both crosses and ends past the window", () => {
    expect(shouldFireDanmaku(1000, 0, 9000)).toBe(true);
  });
});
