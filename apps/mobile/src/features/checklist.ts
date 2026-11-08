/**
 * The checklist of a visit (docs/specs/08 §4, §10.1; step 14). Pure: test/checklist.test.ts.
 * Nothing here locks a step: the rules only say whether to show a warning (founder 05.11). Done = ticked (or a photo
 * attached to a photo item). Skipped («Пропустить», `na`) is NOT done: the tech went on, the item stays «not done» in the
 * history, on the visit's card and in «Требует внимания».
 */
import type { ChecklistItem, ChecklistItemKind, ChecklistTemplate, ChecklistVisitKind, DB, ID, Photo, Role, TemplateItem, Visit, VisitSettings } from "@/data/types";

export const VISIT_SETTINGS_DEFAULT: VisitSettings = { photosBeforeRequired: true, photosAfterRequired: true, minPhotosBefore: 1, minPhotosAfter: 1 };
const MIN_PHOTOS = 1;
const MAX_PHOTOS = 20;

/** old items (only id, label, done) read as a tick … */
export const itemKind = (i: ChecklistItem): ChecklistItemKind => i.kind ?? "check";
/** … and as required: the app held the signature until every one was ticked (docs/specs/08 §11.2 №5) */
export const itemRequired = (i: ChecklistItem): boolean => i.required ?? true;
/**
 * done: a tick is ticked; a photo item has a photo — a LIVE photo of the visit when its photos are given (a photo removed
 * later takes the item back to «not done»; the server's `done` of a photo item is not trusted). Skipped is not done.
 */
export function itemDone(i: ChecklistItem, photos?: readonly Photo[]): boolean {
  if (i.na && !i.done && itemKind(i) === "check") return false;
  if (itemKind(i) === "check") return i.done;
  const ids = i.photoIds ?? [];
  return photos ? ids.some((id) => photos.some((p) => p.id === id)) : ids.length > 0;
}
/** skipped («Пропустить») */
export const itemSkipped = (i: ChecklistItem, photos?: readonly Photo[]): boolean => !!i.na && !itemDone(i, photos);

const validCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= MIN_PHOTOS && v <= MAX_PHOTOS;

/** the company's photo rules with the defaults (only valid values are taken, as the server's app.valid_visit_settings) */
export function visitSettingsOf(company: Pick<NonNullable<DB["company"]>, "visitSettings"> | null | undefined): VisitSettings {
  const raw = (company?.visitSettings ?? {}) as Partial<Record<keyof VisitSettings, unknown>>;
  return {
    photosBeforeRequired: typeof raw.photosBeforeRequired === "boolean" ? raw.photosBeforeRequired : VISIT_SETTINGS_DEFAULT.photosBeforeRequired,
    photosAfterRequired: typeof raw.photosAfterRequired === "boolean" ? raw.photosAfterRequired : VISIT_SETTINGS_DEFAULT.photosAfterRequired,
    minPhotosBefore: validCount(raw.minPhotosBefore) ? raw.minPhotosBefore : VISIT_SETTINGS_DEFAULT.minPhotosBefore,
    minPhotosAfter: validCount(raw.minPhotosAfter) ? raw.minPhotosAfter : VISIT_SETTINGS_DEFAULT.minPhotosAfter,
  };
}
export const visitSettings = (db: Pick<DB, "company">): VisitSettings => visitSettingsOf(db.company);

/** the kind of a visit for templates: an inspection, or any visit of a job */
export const checklistKindOf = (v: Pick<Visit, "kind" | "jobId">): ChecklistVisitKind => (v.kind === "inspection" || (!v.jobId && !v.kind) ? "inspection" : "work");

/** the photo minimums of a visit: the company's, raised (never lowered) by the templates its items came from */
export function photoMinimums(visit: Pick<Visit, "checklist">, settings: VisitSettings, templates: ChecklistTemplate[] = []): { before: number; after: number } {
  const used = new Set((visit.checklist ?? []).map((i) => i.templateId).filter((x): x is ID => !!x));
  let before = settings.minPhotosBefore;
  let after = settings.minPhotosAfter;
  for (const t of templates) {
    if (!used.has(t.id)) continue;
    if (validCount(t.minPhotosBefore)) before = Math.max(before, t.minPhotosBefore);
    if (validCount(t.minPhotosAfter)) after = Math.max(after, t.minPhotosAfter);
  }
  return { before, after };
}

export interface Missing {
  items: ID[];
  photosBefore: number;
  photosAfter: number;
}

function missingOf(visit: Visit, settings: VisitSettings, templates: ChecklistTemplate[], countSkipped: boolean): Missing {
  const inspection = checklistKindOf(visit) === "inspection";
  const min = photoMinimums(visit, settings, templates);
  const photos = visit.photos ?? [];
  const before = photos.filter((p) => p.kind === "before").length;
  const after = photos.filter((p) => p.kind === "after").length;
  return {
    items: (visit.checklist ?? []).filter((i) => itemRequired(i) && !itemDone(i, photos) && (countSkipped || !itemSkipped(i, photos))).map((i) => i.id),
    // an inspection has no work: the company's «photos before work» is not about it — only its own items (В6, e2e 40)
    photosBefore: !inspection && settings.photosBeforeRequired ? Math.max(0, min.before - before) : 0,
    // an inspection has no «after»: it ends on site with «Готово» (§11.5 №25)
    photosAfter: !inspection && settings.photosAfterRequired ? Math.max(0, min.after - after) : 0,
  };
}

/**
 * What to warn about before the next step (§4, §10.1). Never a lock.
 * - warnBeforeWork: on_site → working, photos «before» short (a job visit).
 * - warnBeforeSign: working → signed, required items not done and not skipped, or photos «after» short. For an
 *   inspection it is the one check before «Готово»: items and photos «before».
 * Skipped items do not warn again: «Пропустить» lets the tech go on. Short photos are not stored as skipped: after
 * «Пропустить» in the sheet the screen goes on for this one step (it does not ask again on the same press).
 * Photo minimums from templates are known where the templates are read (the office); the tech's phone uses the
 * company's — the snapshot of the minimums comes with CH2 (docs/specs/08 §11.7).
 */
export function checklistGate(visit: Visit, settings: VisitSettings, templates: ChecklistTemplate[] = []): { warnBeforeWork: boolean; warnBeforeSign: boolean; missing: Missing } {
  const missing = missingOf(visit, settings, templates, false);
  const inspection = checklistKindOf(visit) === "inspection";
  return {
    missing,
    warnBeforeWork: !inspection && missing.photosBefore > 0,
    warnBeforeSign: missing.items.length > 0 || missing.photosAfter > 0,
  };
}

/** the visit went past the client (signed, paid, done) or was closed without payment */
const finished = (v: Visit) => v.step === "signed" || v.step === "paid" || v.step === "done" || !!v.closed;

/**
 * What a finished visit left undone (for its card and «Требует внимания», §8, В4): required items not done (skipped
 * ones count), photos short. Nothing for a visit not finished yet, or started before the company turned checklists on
 * (`since`, §11.5 №26 — no flood of old visits).
 */
export function visitMissed(visit: Visit, settings: VisitSettings, templates: ChecklistTemplate[] = [], since?: string): Missing {
  const none: Missing = { items: [], photosBefore: 0, photosAfter: 0 };
  if (!finished(visit)) return none;
  if (since && Date.parse(visit.start) < Date.parse(since)) return none;
  return missingOf(visit, settings, templates, true);
}
export const missedCount = (m: Missing): number => m.items.length + (m.photosBefore > 0 ? 1 : 0) + (m.photosAfter > 0 ? 1 : 0);

/**
 * The snapshot of templates that comes into a new visit (§5; S4, S9): «every visit» → by the visit's kind → by the
 * services (catalog items of the chosen option and of the job's lines). Archived templates are left out; an item of a
 * template already taken is not taken twice. Each item gets a new id (`newId`): a visit's item is its own row.
 */
export function checklistFor(
  visit: { kind: ChecklistVisitKind; catalogItemIds?: ID[] },
  templates: ChecklistTemplate[],
  newId: () => ID,
): ChecklistItem[] {
  const live = templates.filter((t) => !t.archivedAt);
  const services = new Set(visit.catalogItemIds ?? []);
  const order = [
    ...live.filter((t) => t.appliesTo.everyVisit),
    ...live.filter((t) => t.appliesTo.visitKinds.includes(visit.kind)),
    ...live.filter((t) => t.appliesTo.catalogItemIds.some((id) => services.has(id))),
  ];
  const seenTemplate = new Set<ID>();
  const seenItem = new Set<ID>();
  const out: ChecklistItem[] = [];
  for (const t of order) {
    if (seenTemplate.has(t.id)) continue;
    seenTemplate.add(t.id);
    for (const it of t.items) {
      if (seenItem.has(it.id)) continue;
      seenItem.add(it.id);
      out.push({
        id: newId(), label: it.label, done: false, kind: it.kind, required: it.required,
        ...(it.hint ? { hint: it.hint } : {}), templateId: t.id, templateName: t.name, position: out.length,
      });
    }
  }
  return out;
}

/** the photo stage of a photo item by the visit's step (§11.5 №27): before work — «before», then «after» */
export const photoStageOf = (v: Pick<Visit, "step">): "before" | "after" => (v.step === "working" || v.step === "signed" || v.step === "paid" ? "after" : "before");

/* ---- who may do what (docs/specs/08 §8, §11.6; the server checks the same — a refusal would hold the queue) ---- */

/** the office of the checklist: the director (owner, admin) and the dispatcher (office); sales only reads */
const office = (r: Role) => r === "director" || r === "dispatcher";
/** the visit is closed for the tech: signed, finished (inspection «Готово», completed), closed without payment */
export const visitClosed = (v: Pick<Visit, "step" | "closed" | "signature">): boolean =>
  !!v.signature || v.step === "signed" || v.step === "paid" || v.step === "done" || !!v.closed;
/** tick (done = true) / untick: once the visit is closed a tech only finishes what was left */
export const canTick = (role: Role, v: Pick<Visit, "step" | "closed" | "signature">, done: boolean): boolean =>
  office(role) || (role === "tech" && (done || !visitClosed(v)));
/** «Пропустить»: not on a closed visit for a tech */
export const canSkip = (role: Role, v: Pick<Visit, "step" | "closed" | "signature">): boolean => office(role) || (role === "tech" && !visitClosed(v));
/** a photo on a photo item: the tech may send a missing photo later (§8) */
export const canAttachPhoto = (role: Role): boolean => office(role) || role === "tech";
/** a new item: the office any; a tech only optional, not on a closed visit */
export const canAddItem = (role: Role, v: Pick<Visit, "step" | "closed" | "signature">, required: boolean): boolean =>
  office(role) || (role === "tech" && !required && !visitClosed(v));
/** remove: a required item — the director; an optional — the office; a tech — only his own optional, before the close */
export function canRemoveItem(role: Role, me: ID, v: Pick<Visit, "step" | "closed" | "signature">, i: ChecklistItem): boolean {
  if (role === "director") return true;
  if (role === "dispatcher") return !itemRequired(i);
  return role === "tech" && !itemRequired(i) && i.addedBy === me && !visitClosed(v);
}
/** «Просмотрено»: the office */
export const canReview = (role: Role): boolean => office(role);
/** templates: the office (founder В2) */
export const canEditTemplates = (role: Role): boolean => office(role);
/** the company's photo rules: the director (companies: owner, admin) */
export const canEditVisitSettings = (role: Role): boolean => role === "director";

/* ---- text as the server takes it (no control characters — a new line is one; lengths of the columns) ---- */
export const LABEL_MAX = 300;
export const TEMPLATE_NAME_MAX = 120;
export const PHOTOS_PER_ITEM_MAX = 20;
/** control characters (new lines, tabs) → a space; spaces trimmed; cut to `max` */
export const cleanText = (s: string | undefined, max: number = LABEL_MAX): string =>
  (s ?? "").replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").trim().slice(0, max).trim();

/** a template as the server takes it, or null when it would be refused (no name) */
export function cleanTemplate(t: ChecklistTemplate): ChecklistTemplate | null {
  const name = cleanText(t.name, TEMPLATE_NAME_MAX);
  if (!name) return null;
  const seen = new Set<ID>();
  const items: TemplateItem[] = [];
  for (const i of t.items) {
    const label = cleanText(i.label);
    if (!label || seen.has(i.id)) continue;
    seen.add(i.id);
    const hint = cleanText(i.hint);
    items.push({ id: i.id, label, kind: i.kind, required: i.required, ...(hint ? { hint } : {}) });
  }
  return { ...t, name, items: items.slice(0, 100) };
}

