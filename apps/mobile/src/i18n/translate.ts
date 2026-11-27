/**
 * Translation without React: the app's own language (useI18n) and the language of what goes to a client (tFor),
 * which are different (founder's rule 05.11.2026). Pure — tested in test/docLanguage.test.ts.
 */
import { fmtUsd } from "@octo/estimating-engine";
import { ru, type DictKey, type Dict } from "./ru";
import { en } from "./en";
import { es } from "./es";

export type Lang = "en" | "ru" | "es";
/** what a client may read: documents, the /p/ page, SMS and email texts (founder's decision В11: en, es, ru) */
export type DocLang = "en" | "es" | "ru";
export const DOC_LANGS: DocLang[] = ["en", "es", "ru"];
/** how each client language is named, in itself (the same in every app language) */
export const DOC_LANG_LABEL: Record<DocLang, string> = { en: "English", es: "Español", ru: "Русский" };
const dicts: Record<Lang, Dict> = { ru, en, es };
export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: DictKey, params?: Params): string {
  let s = dicts[lang][key] ?? ru[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  // a value that ends with a dot («ср, 11 нояб.») before the sentence's own dot: one dot, not two (#1104 п.3); «...» stays
  return s.replace(/(?<!\.)\.\.(?!\.)/g, ".");
}

/** the app's language as I18nProvider holds it (null before it); the store seeds the demo in it (#1223) */
let appLang: Lang | null = null;
export const setAppLang = (l: Lang) => {
  appLang = l;
};
export const appLangNow = (): Lang | null => appLang;

/** A translator for a client's language: tFor(docLanguageFor(db, …))("key"). */
export const tFor = (lang: DocLang) => (key: DictKey, params?: Params) => translate(lang, key, params);

/** the forms a counted phrase has in the dictionaries: «<base>.one / .few / .many / .other» (the same four keys in RU, EN, ES) */
export type PluralForm = "one" | "few" | "many" | "other";
/** the bases of counted phrases: «vf.load» for «vf.load.one» … «vf.load.other» */
export type PluralBase = { [K in DictKey]: K extends `${infer B}.one` ? (`${B}.few` extends DictKey ? B : never) : never }[DictKey];
const LOCALE: Record<Lang, string> = { en: "en-US", ru: "ru-RU", es: "es-US" };
const rules = new Map<Lang, Intl.PluralRules | null>();
/** The form of a number in a language — Intl.PluralRules (DS §4.2: never «выезд(а)», «visit(s)»); without Intl — the RU/EN rule by hand. */
export function pluralForm(lang: Lang, n: number): PluralForm {
  if (!rules.has(lang)) rules.set(lang, typeof Intl !== "undefined" && typeof Intl.PluralRules === "function" ? new Intl.PluralRules(LOCALE[lang]) : null);
  const r = rules.get(lang);
  const c = r ? r.select(n) : lang !== "ru" ? (n === 1 ? "one" : "other") : n % 10 === 1 && n % 100 !== 11 ? "one" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "few" : "many";
  return c === "one" || c === "few" || c === "many" ? c : "other";
}
/** A counted phrase: plural("ru", "vf.load", 3, { ranges }) → «3 выезда · …»; {n} is the number. */
export function plural(lang: Lang, base: PluralBase, n: number, params?: Params): string {
  return translate(lang, `${base}.${pluralForm(lang, n)}` as DictKey, { ...params, n });
}

/** A length of time in minutes, in words: «45 мин», «4 ч», «1 ч 30 мин» (DS §4.5 «Длительность»; not «240 мин»). */
export function durationText(lang: Lang, min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return translate(lang, "time.min", { n: m });
  return m % 60 === 0 ? translate(lang, "time.h", { h: m / 60 }) : translate(lang, "time.hmin", { h: Math.floor(m / 60), m: m % 60 });
}

/** Money in US format (rule 7), ALWAYS with cents (founder #2672: «сумма должна быть с центами», #2888): «$1,840.00», «$772.36»;
 *  a negative amount takes the minus sign «−» (U+2212, DS §4.5), not a hyphen. The engine's `fmtUsd` — one format for every screen. */
export function moneyText(cents: number): string {
  return fmtUsd(cents);
}
/**
 * Money on an overview (founder 27.11, #3029/#3030: «центы — только внутри документов»): KPI tiles, the rows of every list, the totals
 * of «Главная», «Деньги», a client's overview — whole dollars, rounded half up on the cents («$1,840», «$1,375.50» → «$1,376»); under
 * a dollar the cents stay («$0.45»: «$0» would say nothing). The documents (an estimate, an invoice, a receipt, the PDF, /p/, a supplier's
 * order), the editor and every amount field keep `moneyText` with cents. Only the showing changes: the sums are whole cents (rule 8).
 */
export function moneyWholeText(cents: number): string {
  const c = Math.round(cents);
  const abs = Math.abs(c);
  if (abs < 100) return fmtUsd(c);
  const dollars = Math.floor((abs + 50) / 100);
  return `${c < 0 ? "−" : ""}$${dollars.toLocaleString("en-US")}`;
}
/** A signed number for a percent or a count: «−218.2», not «-218.2» (the minus sign U+2212, DS §4.5) */
export const signedText = (n: number): string => (n < 0 ? `−${String(-n)}` : String(n));
