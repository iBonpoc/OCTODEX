import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { getLocales } from "expo-localization";
import { dec, roundCents } from "@octo/estimating-engine";
import { usePersistentState } from "@/data/persist";
import type { DictKey } from "./ru";
import { translate, type DocLang, type Lang, type Params } from "./translate";

export { tFor, DOC_LANGS, DOC_LANG_LABEL, type DocLang, type Lang } from "./translate";
export const languages: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
  { id: "es", label: "Español" },
];

/** US market: English by default; Russian/Spanish if the device is set to them. */
function deviceLang(): Lang {
  const code = getLocales()[0]?.languageCode ?? "en";
  return code === "ru" || code === "es" ? code : "en";
}

export interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: DictKey, params?: Params) => string;
  money: (cents: number) => string;
  /** whole dollars for tight places (KPI tiles) */
  moneyWhole: (cents: number) => string;
  time: (iso: string) => string;
  day: (iso: string) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

/** Money and dates are always US formats ($, en-US) — the business operates in the US. */
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang, ready] = usePersistentState<Lang>("octo.lang.v1", deviceLang);
  const t = useCallback(
    (key: DictKey, params?: Params) => translate(lang, key, params),
    [lang],
  );
  const value = useMemo<I18nCtx>(() => {
    const locale = lang === "en" ? "en-US" : lang === "es" ? "es-US" : "ru-RU";
    const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
    const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" });
    return {
      lang,
      setLang,
      t,
      money: (cents) => (cents % 100 === 0 ? usd.format(cents / 100) : usdCents.format(cents / 100)),
      moneyWhole: (cents) => usd.format(roundCents(dec(cents).div(100))),
      time: (iso) => timeFmt.format(new Date(iso)),
      day: (iso) => dayFmt.format(new Date(iso)),
    };
  }, [lang, t]);
  if (!ready) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Dates on what goes to a client: always US numeric (11/05/2026), the same in every client language (rule 7). */
const docDayFmt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

/**
 * Everything inside speaks the client's language (rule 7: the /p/ page, its buttons, sheets and toasts).
 * Money stays US; dates become US numeric. The app's own language is untouched outside.
 */
export function I18nOverride({ lang, children }: { lang: DocLang; children: ReactNode }) {
  const parent = useI18n();
  const value = useMemo(() => overrideI18n(parent, lang), [parent, lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The context inside I18nOverride: the client's language for t / lang / day; money as is; setLang does nothing. Pure. */
export function overrideI18n(parent: I18nCtx, lang: DocLang): I18nCtx {
  return { ...parent, lang, setLang: () => {}, t: (key, params) => translate(lang, key, params), day: (iso) => docDayFmt.format(new Date(iso)) };
}

export function useI18n(): I18nCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}

export type { DictKey };
