/**
 * Rows of the checklist tables → the app's shapes (step 14, docs/specs/08 §11.3; migration 20261108140000). Pure:
 * test/checklistMap.test.ts. A server before the migration has no visit_checklist_items: the reader then gets `null`
 * and the visit keeps its old visits.checklist array (rule 16, step 1).
 */
import type { ChecklistItem, ChecklistTemplate, ChecklistVisitKind, ID, NaReason, TemplateItem, VisitSettings } from "@/data/types";
import { NA_REASONS } from "@/data/types";

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);

/** one row of visit_checklist_items → an item */
export function itemFromDb(r: Row): ChecklistItem {
  const kind = r.kind === "photo" ? "photo" : "check";
  const skipped = r.skipped === true && r.done !== true;
  const reason = NA_REASONS.includes(r.na_reason as NaReason) ? (r.na_reason as NaReason) : undefined;
  const photos = Array.isArray(r.photo_ids) ? (r.photo_ids as unknown[]).filter((x): x is string => typeof x === "string") : [];
  return {
    id: String(r.id),
    label: String(r.label ?? ""),
    done: r.done === true,
    kind,
    required: r.required === true,
    ...(str(r.hint) ? { hint: str(r.hint) } : {}),
    ...(str(r.template_id) ? { templateId: str(r.template_id) } : {}),
    ...(str(r.template_name) ? { templateName: str(r.template_name) } : {}),
    ...(str(r.done_by) ? { doneBy: str(r.done_by) } : {}),
    ...(str(r.done_at) ? { doneAt: str(r.done_at) } : {}),
    ...(skipped ? { na: { ...(reason ? { reason } : {}), ...(str(r.na_text) ? { text: str(r.na_text) } : {}), ...(str(r.na_by) ? { by: str(r.na_by) } : {}), at: str(r.na_at) ?? str(r.updated_at) ?? "" } } : {}),
    ...(photos.length ? { photoIds: photos } : {}),
    ...(str(r.created_by) ? { addedBy: str(r.created_by) } : {}),
    position: typeof r.position === "number" ? r.position : 0,
  };
}

/** the live rows by visit, in the visit's order (position, then when added, then id — as the server's mirror) */
export function itemsByVisit(rows: Row[]): Map<ID, ChecklistItem[]> {
  const out = new Map<ID, { item: ChecklistItem; at: string }[]>();
  for (const r of rows) {
    if (r.deleted_at) continue;
    const v = String(r.visit_id);
    const list = out.get(v) ?? [];
    list.push({ item: itemFromDb(r), at: String(r.created_at ?? "") });
    out.set(v, list);
  }
  const sorted = new Map<ID, ChecklistItem[]>();
  for (const [v, list] of out) {
    list.sort((a, b) => (a.item.position ?? 0) - (b.item.position ?? 0) || a.at.localeCompare(b.at) || a.item.id.localeCompare(b.item.id));
    sorted.set(v, list.map((x) => x.item));
  }
  return sorted;
}

/**
 * the checklist of a visit: its rows when the server has the table (`byVisit` not null; a visit without rows has none),
 * else the old array (a server before the migration)
 */
export function checklistOf(visitId: ID, oldArray: unknown, byVisit: Map<ID, ChecklistItem[]> | null): ChecklistItem[] {
  if (byVisit) return byVisit.get(visitId) ?? [];
  return Array.isArray(oldArray) ? (oldArray as ChecklistItem[]) : [];
}

const KINDS: ChecklistVisitKind[] = ["inspection", "work"];
const count = (v: unknown): number | undefined => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 20 ? v : undefined);

/** one row of checklist_templates → a template (items the server checked: app.valid_checklist_items) */
export function templateFromDb(r: Row): ChecklistTemplate {
  const items: TemplateItem[] = (Array.isArray(r.items) ? (r.items as Row[]) : []).map((x) => ({
    id: String(x.id), label: String(x.label ?? ""), kind: x.kind === "photo" ? "photo" : "check", required: x.required === true,
    ...(str(x.hint) ? { hint: str(x.hint) } : {}),
  }));
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    items,
    appliesTo: {
      everyVisit: r.applies_every_visit === true,
      visitKinds: (Array.isArray(r.applies_visit_kinds) ? (r.applies_visit_kinds as string[]) : []).filter((k): k is ChecklistVisitKind => KINDS.includes(k as ChecklistVisitKind)),
      catalogItemIds: Array.isArray(r.applies_catalog_item_ids) ? (r.applies_catalog_item_ids as unknown[]).map(String) : [],
    },
    ...(count(r.min_photos_before) ? { minPhotosBefore: count(r.min_photos_before) } : {}),
    ...(count(r.min_photos_after) ? { minPhotosAfter: count(r.min_photos_after) } : {}),
    ...(str(r.module_key) ? { module: str(r.module_key) } : {}),
    ...(str(r.archived_at) ? { archivedAt: str(r.archived_at) } : {}),
  };
}

/** companies.visit_settings as stored (features/checklist.ts visitSettingsOf fills the gaps); not an object → none */
export const visitSettingsFromDb = (v: unknown): Partial<VisitSettings> | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Partial<VisitSettings>) : undefined;
