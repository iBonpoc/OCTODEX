/**
 * «Notes — заметка» and «Terms — условия» rows of the estimate (DS §8.12, spec 40 §6, #1304): what the row shows.
 * Pure: the rows and the tests read the same words.
 */
import type { Company, Estimate, EstimateDoc } from "@/data/types";
import { DOC_LANGS, type DocLang } from "@/i18n/translate";
import { cleanTerms, termsDefault, termsForClient } from "@/features/estimateTerms";

/** how much of a text a row shows (one line on a phone) */
export const PREVIEW_MAX = 60;

/** the first words of a text for its row: the first line, cut at a word and «…»; nothing written — null («Не заполнено») */
export function firstWords(text: string | undefined | null, max = PREVIEW_MAX): string | null {
  const line = (text ?? "").split("\n").map((x) => x.trim()).find((x) => x) ?? "";
  if (!line) return null;
  const chars = Array.from(line);
  if (chars.length <= max) return line;
  const cut = chars.slice(0, max).join("");
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
}

/**
 * The Terms the row shows and whether they are the estimate's own: an estimate with the key — its text ("" — none);
 * an estimate made before #1304 (no key) — what its client reads now, the company's default in their language, and the
 * key is NOT added until the text is changed here (spec 40 §6: the old estimate keeps showing the default)
 */
export function termsShown(doc: Pick<EstimateDoc, "terms">, co: Pick<Company, "estimate"> | null | undefined, lang: DocLang, signed = false): { text: string; own: boolean } {
  // a signed estimate without its own text shows what its client signed (the old single text) — as /p/, the PDF and the card
  return { text: termsForClient(doc, co, lang, signed), own: typeof doc.terms === "string" };
}

/**
 * What «Готово» of the Terms sheet writes: the text when it differs from what the estimate has (its own text, or — an old
 * estimate without the key — the default the row showed); null — nothing (an old estimate opened and closed keeps no key,
 * its client goes on reading the company's default, spec 40 §6)
 */
export function termsToWrite(doc: Pick<EstimateDoc, "terms">, shown: string, typed: string): string | null {
  if (typeof doc.terms === "string") return typed === doc.terms ? null : typed;
  // the default as it would be stored (an old single text may hold a CR or a control character): opened and closed - no key
  return typed === (cleanTerms(shown) ?? "") ? null : typed;
}

/** signed by the client: the one rule of the card, /p/ and the PDF - a signature on it, or a status after signing */
export function isSignedEstimate(e: Pick<Estimate, "approval" | "status"> | undefined | null): boolean {
  return !!e && (!!e.approval || e.status === "approved" || e.status === "awaiting_countersign");
}

/** the Terms shown are the company's English because it has none in the client's language (the sheet says so, one line) */
export function termsFallbackToEnglish(doc: Pick<EstimateDoc, "terms">, co: Pick<Company, "estimate"> | null | undefined, lang: DocLang): boolean {
  if (lang === "en" || co?.estimate.termsByLang?.[lang]?.trim()) return false;
  const def = termsDefault(co, lang);
  return !!def && (typeof doc.terms !== "string" || doc.terms === def);
}

/** the company's Terms fields on the screen: English always (the fallback), the others once written or added */
export function termsLangsShown(est: Pick<Company["estimate"], "termsByLang">, added: DocLang[]): DocLang[] {
  return DOC_LANGS.filter((l) => l === "en" || est.termsByLang?.[l] !== undefined || added.includes(l));
}

/**
 * The company's Terms after one language's field is written: the old single text stands for English when the record has no
 * languages yet (a company cached by an older build) — else saving Spanish alone would send no English and wipe it (review)
 */
export function companyTermsWrite(est: Pick<Company["estimate"], "terms" | "termsByLang">, lang: DocLang, v: string): Partial<Record<DocLang, string>> {
  const base = est.termsByLang ?? (est.terms?.trim() ? { en: est.terms } : {});
  return { ...base, [lang]: cleanTerms(v) ?? "" };
}
