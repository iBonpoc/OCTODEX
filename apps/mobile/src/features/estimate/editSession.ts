/**
 * #2381 (К1, «сессия правки»; ревью 2): what the estimate editor does with an edit of a SAVED estimate — pure, unit-tested
 * (test/editSession.test.ts); the screen (app/estimate/new.tsx) only asks and acts. Spec: notes/review-v2/k1-2381-stage0.md §4, §10–11.
 */
import type { Estimate } from "@/data/types";

/**
 * Р6: an estimate's own save mark — `doc.savedAt` (the document carries it: `saveEstimate` writes it; the server keeps it in
 * calc_inputs). NOT `Estimate.savedAt`: for an older estimate that one falls back to the server's sent_at / updated_at, and
 * updated_at moves when the client only looks — a false conflict. No mark (an old estimate) — "".
 */
export const markOf = (e: Pick<Estimate, "doc"> | null | undefined): string => {
  const m = (e?.doc as { savedAt?: unknown } | undefined)?.savedAt;
  return typeof m === "string" ? m : "";
};

/**
 * Р1 (spec §4 п.2): «Готово» on a saved estimate with no edits only closes — nothing written, «sent» and its time untouched. `stale` —
 * the saved document is not what a save would write now (the client became tax exempt since: the tax goes off only by a save,
 * e2e 72): a DRAFT then saves, as before; a sent or signed one only closes (money never changes from a look — the lead №23).
 */
export const doneAction = (p: { existing: boolean; dirty: boolean; stale?: boolean; status?: string }): "close" | "save" =>
  // №23: a stale document is re-saved only while it is a DRAFT — a sent or signed estimate only looked at never changes the client's
  // money nor turns sent → draft; its tax goes off with the next real edit
  p.existing && !p.dirty && !(p.stale && p.status === "draft") ? "close" : "save";

/**
 * #2935 п.1 (founder 27.11: «Давай кнопку отправить вниз, как у Джобер»; replaces #2379 «Отправить — вверху» in this part): the pinned
 * bar of the editor of a document that is sent to the client. Where sending is possible (the office's role, not signed, a line on
 * it) the main yellow one at the bottom is «Отправить» and «Готово» is the second, unfilled, beside it; the header has no send icon
 * (one place for one action). The bar holds «Итого», «Готово» and «Отправить» — no room for a fourth: «Отменить» (only with edits,
 * #2381) then goes into «⋯». Where it is not possible — «Готово» stays the main one, «Отменить» beside it as before. No line yet —
 * the first step adds one (#2387). The press of «Отправить» with no client says what is missing (DS §11 п.3: the main one is never
 * off). Pure: test/editSession.test.ts; the screen — app/estimate/new.tsx, e2e 308.
 */
export type BarStep = "add" | "send" | "sendChanges" | "done";
/** `sent` — the estimate already went to the client (saved, status not `draft`): its send is «Отправить изменения» (`r1.est.sendChanges`,
 *  as the header's ➤ said before #2935; CRM review 27.11: the client gets a new version, not a first one); a draft keeps «Отправить» */
export const barSteps = (p: { mayShare: boolean; signed: boolean; hasLines: boolean; dirty: boolean; sent?: boolean }): { main: BarStep; second: "done" | null; cancel: "bar" | "more" | null } => {
  if (!p.signed && !p.hasLines) return { main: "add", second: null, cancel: null };
  const cancel = p.dirty && !p.signed;
  if (p.mayShare && !p.signed) return { main: p.sent ? "sendChanges" : "send", second: "done", cancel: cancel ? "more" : null };
  return { main: "done", second: null, cancel: cancel ? "bar" : null };
};

/**
 * What stands between the step and the edit:
 * - `go` — nothing;
 * - `signed` — the estimate got signed (`approved`): the edits cannot go into it;
 * - `await` — the client signed (`awaiting_countersign`): saving takes the signature off;
 * - `conflict` — saved on another phone since the edit began (the mark differs; an edit without its base — asked too);
 * - `missing` — not in the store though the store is loaded (deleted on another phone): never made again with the same id;
 * - `wait` — not in the store and the store not loaded yet (a cache emptied by a sign-out): nothing decided (Р5).
 */
export type Gate = "go" | "signed" | "await" | "conflict" | "missing" | "wait";
type Live = Pick<Estimate, "status" | "doc"> | undefined;

function gate(live: Live, base: string | undefined, storeLoaded: boolean): Gate {
  if (!live) return storeLoaded ? "missing" : "wait";
  if (live.status === "approved") return "signed";
  if (live.status === "awaiting_countersign") return "await";
  if (base === undefined || base !== markOf(live)) return "conflict";
  return "go";
}

/** before «Готово» saves an edit */
export const gateBeforeSave = (p: { isEdit: boolean; live?: Live; base?: string; dirty: boolean; storeLoaded: boolean }): Gate => (p.isEdit ? gate(p.live, p.base, p.storeLoaded) : "go");

/** at the opening, when this estimate's edits are on the phone (asked once) */
export const gateAtOpen = (p: { hasEditDraft: boolean; live?: Live; base?: string; storeLoaded: boolean }): Gate => (p.hasEditDraft ? gate(p.live, p.base, p.storeLoaded) : "go");

/** Р4: the conflict's answer — only «Мои правки» is mine; «Назад», Esc (null) and «Их версию» are not */
export const takeMine = (k: string | null): boolean => k === "mine";
