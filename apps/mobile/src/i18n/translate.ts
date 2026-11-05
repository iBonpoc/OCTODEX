/**
 * Translation without React: the app's own language (useI18n) and the language of what goes to a client (tFor),
 * which are different (founder's rule 05.11.2026). Pure — tested in test/docLanguage.test.ts.
 */
import { ru, type DictKey, type Dict } from "./ru";
import { en } from "./en";
import { es } from "./es";

export type Lang = "en" | "ru" | "es";
/** what a client may read: documents, the /p/ page, SMS and email texts */
export type DocLang = "en" | "es";
export const DOC_LANGS: DocLang[] = ["en", "es"];
const dicts: Record<Lang, Dict> = { ru, en, es };
export type Params = Record<string, string | number>;

export function translate(lang: Lang, key: DictKey, params?: Params): string {
  let s = dicts[lang][key] ?? ru[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** A translator for a client's language: tFor(docLanguageFor(db, …))("key"). */
export const tFor = (lang: DocLang) => (key: DictKey, params?: Params) => translate(lang, key, params);
