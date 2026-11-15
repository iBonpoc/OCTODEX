/**
 * «Notes» and «Terms & conditions» of an estimate (#1304, docs/specs/40): what a new estimate gets, what the client reads.
 * - The company keeps a default Terms text by the client's language (`estimate.termsByLang`): the client's language → en → the
 *   old single `estimate.terms` (rule 16, step 1) → nothing. Notes have no default.
 * - A new estimate takes the default in the client's language (docLanguageFor without a person — the server's
 *   app.estimate_doc_language counts the same way); the text is then the estimate's own: a snapshot in the version, frozen
 *   by sending, never moved by a later change of the company's default.
 * - An estimate without the key (made before #1304, or by an older phone) shows the client the company's default in their
 *   language — the same order as the server (portal_estimate; db test T205 on the same inputs as test/estimateTerms.test.ts).
 */
import type { Company, DB, EstimateDoc } from "@/data/types";
import { docLanguageFor } from "@/data/people";
import { DOC_LANGS, type DocLang } from "@/i18n/translate";

/** the longest Terms text, per language and in an estimate (the server checks the same: companies trigger, estimate_versions) */
export const TERMS_MAX = 10000;

/** a text as it may be stored: \r\n → \n, control characters but a line break and a tab go (Postgres cannot keep a NUL),
 *  at most TERMS_MAX characters (code points — as the server's char_length) */
export function cleanTerms(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  return Array.from(s).slice(0, TERMS_MAX).join("");
}

/** the company's defaults by language as stored (only en / es / ru, strings; blank ones go) */
export function termsByLangFrom(raw: unknown): Partial<Record<DocLang, string>> {
  const out: Partial<Record<DocLang, string>> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const l of DOC_LANGS) {
    const t = cleanTerms((raw as Record<string, unknown>)[l])?.trim();
    if (t) out[l] = t;
  }
  return out;
}

const filled = (v: string | undefined) => (v && v.trim() ? v : undefined);

/** the company's default Terms for a client's language: that language → en → the old single text → "" */
export function termsDefault(co: Pick<Company, "estimate"> | null | undefined, lang: DocLang): string {
  const by = co?.estimate.termsByLang ?? {};
  return filled(by[lang]) ?? filled(by.en) ?? filled(co?.estimate.terms) ?? "";
}

/** who an estimate is for — no person: the estimate is the client's (or the lead's) */
export type TermsFor = { customerId?: string; leadId?: string };

/** the Terms a new estimate starts with, and the language they are in */
export function termsForNew(db: DB, at: TermsFor): { text: string; lang: DocLang } {
  const lang = docLanguageFor(db, { customerId: at.customerId, leadId: at.leadId });
  return { text: termsDefault(db.company, lang), lang };
}

/** the client (or lead) of a draft changed: the text nobody touched (still the old language's default) follows the new
 *  client's language; an edited text stays as it is — nothing is lost */
export function termsOnClientChange(db: DB, current: string | undefined, from: TermsFor, to: TermsFor): string {
  const next = termsForNew(db, to).text;
  if (current === undefined) return next;
  return current === termsForNew(db, from).text ? next : current;
}

/** sending or signing locks the version: an estimate still without its own Terms (a draft made before #1304) takes the
 *  default in the client's language right then — what the client reads from that moment never moves (review of #1328;
 *  the server's trigger t06_terms_on_lock does the same to the version it locks) */
export function withFrozenTerms(db: DB, id: string): DB {
  const e = db.estimates.find((x) => x.id === id);
  if (!e?.doc || e.doc.terms !== undefined) return db;
  const terms = termsForNew(db, { customerId: e.customerId, leadId: e.leadId }).text;
  return { ...db, estimates: db.estimates.map((x) => (x.id === id ? { ...x, doc: { ...x.doc!, terms } } : x)) };
}

/** what the client reads as Terms: the estimate's own text when it has one ("" — none). Without it — a version locked
 *  before #1304 (sending and signing now freeze it, withFrozenTerms): a signed one keeps the old single text it showed
 *  then; an unsigned one (a draft) the company's current default in the client's language (security-check of #1304; the
 *  server the same) */
export function termsForClient(doc: Pick<EstimateDoc, "terms"> | undefined, co: Pick<Company, "estimate"> | null | undefined, lang: DocLang, signed = false): string {
  if (typeof doc?.terms === "string") return doc.terms;
  return signed ? (filled(co?.estimate.terms) ?? "") : termsDefault(co, lang);
}

/** the old single default and the English one stay one text (rule 16, step 1 — the same rule as the server's trigger t08):
 *  en changed → the old one follows; else the old one changed (a screen or an older build editing `terms`) → en follows */
export function syncCompanyTerms(prev: Company["estimate"], next: Company["estimate"]): Company["estimate"] {
  const enOf = (e: Company["estimate"]) => filled(e.termsByLang?.en)?.trim();
  const oldOf = (e: Company["estimate"]) => filled(e.terms)?.trim();
  if (enOf(next) !== enOf(prev)) return { ...next, terms: enOf(next) };
  if (oldOf(next) !== oldOf(prev)) {
    const { en: _en, ...rest } = next.termsByLang ?? {};
    return { ...next, termsByLang: oldOf(next) ? { ...rest, en: oldOf(next) } : rest };
  }
  return next;
}
