import { describe, expect, it } from "vitest";
import { detectLocale, en, initI18n, ja, t, type MessageKey } from "./index";

describe("i18n", () => {
  it("detects Japanese from browser languages", () => {
    expect(detectLocale(["ja-JP", "en-US"])).toBe("ja");
    expect(detectLocale(["ja"])).toBe("ja");
    expect(detectLocale(["en-US", "ja"])).toBe("en");
    expect(detectLocale(["fr-FR"])).toBe("en");
    expect(detectLocale([])).toBe("en");
  });

  it("has matching keys in en and ja", () => {
    const enKeys = Object.keys(en).sort();
    const jaKeys = Object.keys(ja).sort();
    expect(jaKeys).toEqual(enKeys);
  });

  it("translates with params and falls back to English", () => {
    initI18n(["en"]);
    expect(t("io.loadedTrackPoints", { count: 12 })).toBe(
      "Loaded 12 track points."
    );
    initI18n(["ja"]);
    expect(t("common.done")).toBe("完了");
    expect(t("io.loadedTrackPoints", { count: 3 })).toBe(
      "3 件のトラックポイントを読み込みました。"
    );
  });

  it("covers every MessageKey in both catalogs", () => {
    const keys = Object.keys(en) as MessageKey[];
    for (const key of keys) {
      expect(ja[key], `missing ja: ${key}`).toBeTruthy();
      expect(typeof t(key)).toBe("string");
    }
  });
});
