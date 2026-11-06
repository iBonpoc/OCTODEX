/**
 * What the app says (7а-1; docs/legal/01 §3.2а, App Store 2.1): no build-plan words («wave 3», «волна 4», «etapa 4»)
 * and no promises of legal compliance or guarantees in any user-facing string, in every language. No exceptions.
 */
import { describe, it, expect } from "vitest";
import { ru } from "@/i18n/ru";
import { en } from "@/i18n/en";
import { es } from "@/i18n/es";

const BANNED: { name: string; re: RegExp }[] = [
  { name: "build plan (wave N)", re: /\bwaves?\s*\d|волн[аеуы]?\s*\d|\betapa\s*\d|\bola\s*\d|\bphase\s*\d|\bфаз[аеуы]\s*\d/i },
  { name: "compliance promise", re: /\bcompliant\b|\bcompliance\b|соответству\S*\s+закон|юридически провер|\bcumple con la ley\b/i },
  { name: "guarantee", re: /\bguarantee[sd]?\b|гарантир|\bgarantiz/i },
];

describe("user-facing strings", () => {
  for (const [lang, dict] of [["ru", ru], ["en", en], ["es", es]] as const) {
    it(`${lang}: no build-plan words, compliance promises or guarantees`, () => {
      const hits: string[] = [];
      for (const [key, value] of Object.entries(dict)) {
        for (const b of BANNED) if (b.re.test(value)) hits.push(`${key} (${b.name}): ${value.slice(0, 80)}`);
      }
      expect(hits, hits.join("\n")).toEqual([]);
    });
  }
});
