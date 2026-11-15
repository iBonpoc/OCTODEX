import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";
import { ru } from "../src/i18n/ru";

/**
 * DS §4.4а (founder 15.11.2026, #1584): a message says what is happening and what to do — never «не удалось / не получилось /
 * ошибка / сбой» and their EN/ES likes. The words below are looked up in every string the person can read.
 */
const BAD: Record<"ru" | "en" | "es", RegExp> = {
  ru: /не удалось|не получилось|не смог|не вышло|не сработало|ошибк|ошибоч|сбой|сбои|сбоя|неудач|что-то пошло не так/i,
  en: /couldn[’']t|could not|\bfail|\berror|did not work|didn[’']t work|did not go|went wrong|\bunable\b/i,
  es: /no se pudo|no pudimos|\berror|\bfall[óo]\b|\bfallos?\b|no funcion[óo]|algo sali[óo] mal/i,
};

/**
 * Where a forbidden word still stands, and why: key → reason. The list only shrinks (a key that is clean now fails until its line goes).
 * `ds.*` strings are the design-system showcase text: they describe rules and window kinds, they are not messages to a person.
 */
const ALLOWED: Record<string, string> = {};
const ALLOWED_PREFIX: Record<string, string> = {
  "ds.": "витрина дизайн-системы: описание правил и названий видов окон, не сообщение человеку",
};

const dicts = { ru, en, es } as unknown as Record<"ru" | "en" | "es", Record<string, string>>;

const found = (): string[] => {
  const out: string[] = [];
  for (const lang of ["ru", "en", "es"] as const)
    for (const [k, v] of Object.entries(dicts[lang]))
      if (typeof v === "string" && BAD[lang].test(v)) out.push(`${lang} ${k}: ${v}`);
  return out;
};

const allowedKey = (k: string): boolean => k in ALLOWED || Object.keys(ALLOWED_PREFIX).some((p) => k.startsWith(p));

describe("voice: no «не удалось / ошибка / сбой» in the strings a person reads (DS §4.4а)", () => {
  it("every string is clean or listed with a reason", () => {
    const bad = found().filter((l) => !allowedKey(l.split(" ")[1].replace(/:$/, "")));
    expect(bad, "DS §4.4а: say what is happening and what to do, without «не удалось / ошибка / сбой»").toEqual([]);
  });
  it("a listed key that is clean now is taken off the list", () => {
    const live = new Set(found().map((l) => l.split(" ")[1].replace(/:$/, "")));
    const stale = Object.keys(ALLOWED).filter((k) => !live.has(k));
    expect(stale).toEqual([]);
  });
});
