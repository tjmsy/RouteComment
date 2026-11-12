import { en, type MessageKey } from "./en";
import { ja } from "./ja";

export type Locale = "en" | "ja";
export type { MessageKey };

const catalogs: Record<Locale, Record<MessageKey, string>> = {
  en,
  ja,
};

let locale: Locale = "en";

/**
 * Browser language → app locale.
 * First preference Japanese (`ja`, `ja-JP`, …) → `ja`; everything else → `en`.
 */
export function detectLocale(
  languages: readonly string[] = typeof navigator !== "undefined"
    ? navigator.languages?.length
      ? navigator.languages
      : [navigator.language]
    : ["en"]
): Locale {
  const primary = languages[0]?.trim().toLowerCase().split("-")[0];
  return primary === "ja" ? "ja" : "en";
}

export function getLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next;
  }
}

export function initI18n(languages?: readonly string[]): Locale {
  const detected = detectLocale(languages);
  setLocale(detected);
  return detected;
}

export type TParams = Record<string, string | number>;

/** Translate a message key; falls back to English, then the key. */
export function t(key: MessageKey, params?: TParams): string {
  const catalog = catalogs[locale] ?? catalogs.en;
  let text = catalog[key] ?? catalogs.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

export { en, ja };

// Detect browser language as soon as this module loads (before stores init).
if (typeof navigator !== "undefined") {
  initI18n();
}
