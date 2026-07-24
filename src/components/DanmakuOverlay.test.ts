import { describe, expect, it } from "vitest";
import { danmakuActiveAt, DANMAKU_ARM_MS } from "./DanmakuOverlay";
import type { Comment } from "../lib/types";

function danmaku(partial: Partial<Comment> & { timeStartMs: number }): Comment {
  return {
    id: partial.id ?? "d1",
    kind: "danmaku",
    lng: 0,
    lat: 0,
    text: partial.text ?? "hello",
    timeStartMs: partial.timeStartMs,
  };
}

describe("danmakuActiveAt", () => {
  it("matches follow-style inclusive start / exclusive end window", () => {
    const c = danmaku({ timeStartMs: 1000 });
    expect(danmakuActiveAt(c, 999)).toBe(false);
    expect(danmakuActiveAt(c, 1000)).toBe(true);
    expect(danmakuActiveAt(c, 1000 + DANMAKU_ARM_MS - 1)).toBe(true);
    expect(danmakuActiveAt(c, 1000 + DANMAKU_ARM_MS)).toBe(false);
  });

  it("ignores empty text and non-danmaku", () => {
    expect(danmakuActiveAt(danmaku({ timeStartMs: 0, text: "  " }), 0)).toBe(
      false,
    );
    expect(
      danmakuActiveAt(
        {
          id: "f",
          kind: "follow",
          lng: 0,
          lat: 0,
          text: "x",
          timeStartMs: 0,
          timeEndMs: 100,
        },
        50,
      ),
    ).toBe(false);
  });
});
