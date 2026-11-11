/**
 * The estimate being built is kept on the phone as a draft (#760, audit Q-01): «Назад», a reload or the app closed
 * never lose it; opening «+ Смета» from the same place again continues it. Offline from the first change (rule 6):
 * usePersistentState writes it 250 ms after a change and at once when the app leaves.
 * One list per person and company (another person signing in on this phone never sees it); wiped with the account
 * (deleteAccount.ts DEVICE_PREFIXES). Pure parts unit-tested: test/estimateDraft.test.ts.
 */
import type { EstimateDoc } from "@/data/types";
import { usePersistentState } from "@/data/persist";
import { hasContent } from "./estimateDoc";

export const DRAFTS_PREFIX = "octo.drafts.v1.";
/** the person's drafts: demo — one list; the cloud — per company and person */
export const draftsKey = (cloud: boolean, companyId?: string | null, userId?: string | null) =>
  cloud ? `${DRAFTS_PREFIX}${companyId ?? "none"}.${userId ?? "none"}` : `${DRAFTS_PREFIX}demo`;

export interface EstimateDraft {
  /** where the builder was opened from (draftCtx) */
  ctx: string;
  /** ISO time of the last change */
  at: string;
  estimateId: string;
  customerId?: string;
  propertyId?: string;
  title: string;
  doc: EstimateDoc;
  templateId?: string;
  checkPrice: string[];
}
export const MAX_DRAFTS = 10;
export const DRAFT_DAYS = 30;

/** the place the builder was opened from; null — not a new estimate (an edit of a saved one, a template's lines) */
export function draftCtx(p: { id?: string; editTemplate?: string; leadId?: string; customerId?: string; propertyId?: string; template?: string }): string | null {
  if (p.id || p.editTemplate) return null;
  return `new|${p.leadId ?? ""}|${p.customerId ?? ""}|${p.propertyId ?? ""}|${p.template ?? ""}`;
}

/** worth keeping: a line or a title (an untouched builder leaves nothing behind) */
export const draftWorthKeeping = (d: Pick<EstimateDraft, "doc" | "title">) => hasContent(d.doc) || !!d.title.trim();

const fresh = (d: EstimateDraft, now: number) => now - Date.parse(d.at) < DRAFT_DAYS * 86_400_000;

/** the draft of this place: not too old, and not an estimate saved meanwhile (its id already in the data) */
export function findDraft(list: readonly EstimateDraft[], ctx: string | null, now: number, saved: (id: string) => boolean): EstimateDraft | undefined {
  if (!ctx) return undefined;
  const d = list.find((x) => x.ctx === ctx);
  return d && fresh(d, now) && !saved(d.estimateId) && draftWorthKeeping(d) ? d : undefined;
}

/** this place's draft put first; the old and the over-the-limit ones go */
export function upsertDraft(list: readonly EstimateDraft[], d: EstimateDraft, now: number): EstimateDraft[] {
  return [d, ...list.filter((x) => x.ctx !== d.ctx && fresh(x, now))].slice(0, MAX_DRAFTS);
}

/** this place's draft taken out; the same list when there is none (nothing written) */
export function removeDraft(list: readonly EstimateDraft[], ctx: string | null): EstimateDraft[] {
  if (!ctx || !list.some((x) => x.ctx === ctx)) return list as EstimateDraft[];
  return list.filter((x) => x.ctx !== ctx);
}

const valid = (v: unknown): v is EstimateDraft[] =>
  Array.isArray(v) && v.every((x) => x && typeof x.ctx === "string" && typeof x.at === "string" && Array.isArray(x.doc?.options));

/** the person's drafts on this phone; `ready` — read */
export function useEstimateDrafts(key: string) {
  const [list, setList, ready] = usePersistentState<EstimateDraft[]>(key, [], { validate: valid });
  return { list, setList, ready, key };
}
