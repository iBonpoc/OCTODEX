/**
 * The estimate being built is kept on the phone as a draft (#760, audit Q-01): «Назад», a reload or the app closed
 * never lose it; opening «+ Смета» from the same place again continues it. Offline from the first change (rule 6):
 * usePersistentState writes it 250 ms after a change and at once when the app leaves.
 * One list per person and company (another person signing in on this phone never sees it); wiped with the account
 * (deleteAccount.ts DEVICE_PREFIXES). Pure parts unit-tested: test/estimateDraft.test.ts.
 */
import type { EstimateDoc } from "@/data/types";
import { useCallback, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePersistentState } from "@/data/persist";
import { hasContent, newDoc, normalizeDoc } from "./estimateDoc";

export const DRAFTS_PREFIX = "octo.drafts.v1.";
/**
 * The person's drafts: demo — one list; the cloud — per company and person, from the sign-in (the company chosen), not
 * from the cache (review of #859 №3: before the first load the cache has no company — a shared «none» list would show
 * company A's draft in company B). null — not known yet: the builder waits.
 */
export const draftsKey = (cloud: boolean, companyId?: string | null, userId?: string | null): string | null =>
  !cloud ? `${DRAFTS_PREFIX}demo` : companyId && userId ? `${DRAFTS_PREFIX}${companyId}.${userId}` : null;

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
  /** rows where «Сохранить в каталог» is on (the choice survives a reload; absent in older drafts) */
  wantCatalog?: string[];
  /** #2381: an edit of a saved estimate — the estimate's `savedAt` when the edit began (the conflict is «the store's savedAt ≠ this»;
   *  an older build drops the field — then it is a conflict and asked, never overwritten, rule 16). No sums here: the engine counts them. */
  baseSavedAt?: string;
}
export const MAX_DRAFTS = 10;
export const DRAFT_DAYS = 30;

/** the place the builder was opened from; null — not a new estimate (an edit of a saved one, a template's lines) */
export function draftCtx(p: { id?: string; editTemplate?: string; leadId?: string; customerId?: string; propertyId?: string; template?: string }): string | null {
  if (p.editTemplate) return null;
  // #2381: a saved estimate's edit lives on the phone until «Готово» (an app closed by chance loses nothing)
  if (p.id) return `edit|${p.id}`;
  return `new|${p.leadId ?? ""}|${p.customerId ?? ""}|${p.propertyId ?? ""}|${p.template ?? ""}`;
}

/** worth keeping: a line or a title (an untouched builder leaves nothing behind) */
export const draftWorthKeeping = (d: Pick<EstimateDraft, "doc" | "title">) => hasContent(d.doc) || !!d.title.trim();

/** #2381: the edit of a saved estimate (not a new one): never too old, never pushed out by the limit — the edits of a live estimate */
export const isEditCtx = (ctx: string | null | undefined) => !!ctx && ctx.startsWith("edit|");
const fresh = (d: EstimateDraft, now: number) => isEditCtx(d.ctx) || now - Date.parse(d.at) < DRAFT_DAYS * 86_400_000;

/* #2381: the conflict has ONE rule — features/estimate/editSession.ts (`markOf` of the document, `gate*`), review 3 */

/** the draft of this place: not too old, and not an estimate saved meanwhile (its id already in the data) */
export function findDraft(list: readonly EstimateDraft[], ctx: string | null, now: number, saved: (id: string) => boolean): EstimateDraft | undefined {
  if (!ctx) return undefined;
  const d = list.find((x) => x.ctx === ctx);
  // a new estimate's draft goes once it is saved; a saved estimate's edit is meant to be found (#2381)
  return d && fresh(d, now) && (isEditCtx(ctx) || !saved(d.estimateId)) && draftWorthKeeping(d) ? d : undefined;
}

/** this place's draft put first; the old and the over-the-limit ones go */
export function upsertDraft(list: readonly EstimateDraft[], d: EstimateDraft, now: number): EstimateDraft[] {
  // the limit counts the new estimates only: a saved estimate's edit is never pushed out (#2381)
  const rest = [d, ...list.filter((x) => x.ctx !== d.ctx && fresh(x, now))];
  const edits = rest.filter((x) => isEditCtx(x.ctx));
  const news = rest.filter((x) => !isEditCtx(x.ctx)).slice(0, MAX_DRAFTS);
  return rest.filter((x) => edits.includes(x) || news.includes(x));
}

/** what the builder holds, to compare with how it opened (the time and the place are not part of it) */
export const draftSnapshot = (d: Omit<EstimateDraft, "ctx" | "at">) =>
  JSON.stringify([d.estimateId, d.customerId ?? null, d.propertyId ?? null, d.title, d.doc, d.templateId ?? null, d.checkPrice, ...(d.wantCatalog?.length ? [d.wantCatalog] : [])]);

/**
 * The drafts after a change in the builder (review of #859 №1). As it opened — nothing new to keep: a fresh builder (a
 * template's lines and name, untouched) leaves no draft; a continued one keeps its draft as it was (its time is the last
 * change, not this opening). Changed — kept when worth it, else taken out.
 */
export function nextDrafts(list: readonly EstimateDraft[], d: EstimateDraft, start: { snapshot: string; restored: boolean }, now: number): EstimateDraft[] {
  if (draftSnapshot(d) === start.snapshot) return start.restored ? (list as EstimateDraft[]) : removeDraft(list, d.ctx);
  return draftWorthKeeping(d) ? upsertDraft(list, d, now) : removeDraft(list, d.ctx);
}

/** this place's draft taken out; the same list when there is none (nothing written) */
export function removeDraft(list: readonly EstimateDraft[], ctx: string | null): EstimateDraft[] {
  if (!ctx || !list.some((x) => x.ctx === ctx)) return list as EstimateDraft[];
  return list.filter((x) => x.ctx !== ctx);
}

/**
 * One stored draft, checked and brought to the current shape (an older version's draft: settings missing, an option
 * without lines — rule 16); a broken one is dropped alone, the others stay (review of #859).
 */
export function cleanDraft(x: unknown): EstimateDraft | null {
  const d = x as Partial<EstimateDraft> | null;
  if (!d || typeof d !== "object" || typeof d.ctx !== "string" || typeof d.at !== "string" || typeof d.estimateId !== "string") return null;
  const options = Array.isArray(d.doc?.options) ? d.doc.options.filter((o) => o && typeof o.id === "string" && Array.isArray(o.lines)) : [];
  if (!options.length) return null;
  const base = newDoc();
  return {
    ctx: d.ctx, at: d.at, estimateId: d.estimateId, customerId: d.customerId, propertyId: d.propertyId,
    title: typeof d.title === "string" ? d.title : "",
    doc: normalizeDoc({ ...base, ...d.doc, options, settings: { ...base.settings, ...(d.doc?.settings ?? {}) } }).doc,
    templateId: d.templateId,
    checkPrice: Array.isArray(d.checkPrice) ? d.checkPrice.filter((c) => typeof c === "string") : [],
    ...(Array.isArray(d.wantCatalog) && d.wantCatalog.some((c) => typeof c === "string") ? { wantCatalog: d.wantCatalog.filter((c) => typeof c === "string") } : {}),
    ...(typeof d.baseSavedAt === "string" ? { baseSavedAt: d.baseSavedAt } : {}),
  };
}
export const cleanDrafts = (v: unknown): EstimateDraft[] => (Array.isArray(v) ? v.map(cleanDraft).filter((d): d is EstimateDraft => !!d) : []);

/** the person's drafts on this phone; `ready` — read */
export function useEstimateDrafts(key: string) {
  const [raw, setList, ready, health] = usePersistentState<EstimateDraft[]>(key, [], { validate: Array.isArray });
  // every write starts from the cleaned list ([null, good] would throw in removeDraft/upsertDraft — second review)
  const update = useCallback(
    (fn: (list: EstimateDraft[]) => EstimateDraft[], forKey?: string) => setList((l) => fn(cleanDrafts(l)), forKey),
    [setList],
  );
  // #2381: the phone refused to write (full storage) — the screen says the edits are not kept on the phone
  return { list: cleanDrafts(raw), setList: update, ready, key, writeFailed: health.writeFailed };
}

/**
 * #2381 (review 4): a draft put back on the device straight — for an undo that runs after its editor has closed (the copy's toast
 * «Отменить»): the editor's own list state is gone, a write through it would be lost. One read, one write; a broken list stays.
 * The order with the drafts' deferred write (250 ms, `usePersistentState`): only an estimate editor owns the list; a closing editor
 * writes what waits at once (persist.ts, unmount → flush), and the toast's «Отменить» arms after `toastArmMs` 300 — so the restore
 * comes after. An editor OPEN meanwhile (another estimate's «Изменить» within the toast's 5 s) holds the old list and would write it
 * over the restore: then the restore waits until the last editor closes (after its own final write).
 */
type Kv = { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> };
let openEditors = 0;
let waiting: (() => Promise<unknown>)[] = [];
/** an estimate editor is open (it owns the drafts list until it closes) */
export function markEditorOpen(): () => void {
  openEditors += 1;
  return () => {
    openEditors -= 1;
    if (openEditors > 0) return;
    const run = waiting;
    waiting = [];
    // after the closing editor's own last write (issued in the same unmount, before this runs)
    setTimeout(() => run.forEach((f) => void f()), 0);
  };
}
export function useDraftEditorOpen() {
  useEffect(() => markEditorOpen(), []);
}

export function restoreDraftOnDevice(key: string, d: EstimateDraft, now = Date.now(), s: Kv = AsyncStorage as never): Promise<boolean> {
  const run = async () => {
    try {
      const raw = await s.getItem(key);
      const list = raw ? cleanDrafts(JSON.parse(raw)) : [];
      await s.setItem(key, JSON.stringify(upsertDraft(list, d, now)));
      return true;
    } catch {
      return false;
    }
  };
  if (openEditors > 0) {
    waiting.push(run);
    return Promise.resolve(true);
  }
  return run();
}
