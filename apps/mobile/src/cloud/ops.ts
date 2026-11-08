/**
 * Outbox operations: every change made on the phone is applied locally at once and recorded here,
 * then sent to the OCTODEX database when online (offline-first, docs/06-architecture, ADR-003).
 * Ops are idempotent where money is involved (payments carry idempotency_key = payment id).
 */
// due_date is the company's calendar day (features/zone.ts, docs/specs/03 П4b), not the UTC date of the phone; it is the
// day the invoice was made (op.dueDate, set when the op is queued), not the day the op reaches the server
import { companyToday } from "@/features/zone";
import { cleanText, TEMPLATE_NAME_MAX } from "@/features/checklist";
import { supplierToRow } from "@/features/suppliers";
import { poLineToRow, poToRow } from "@/features/purchaseOrderRows";
import { linesEditable as poLinesEditable } from "@/features/purchaseOrders";
import { realJob } from "./inspectionBridge";
import { discountBps, ENGINE_VERSION, jobLineQty, type DecLike } from "@octo/estimating-engine";
import type { PurchaseOrder, EstimateTemplate, BillingAddress, CalendarEvent, ChecklistItemKind, ChecklistTemplate, NaReason, VisitSettings, MemberPrefs, PushGroup, CustomField, CustomFieldValue, JobLineItem, JobType, CallOutcome, CatalogItem, Company, CompanyContact, CompanyLicense, CustomerStatus, EstimateDoc, ExpenseCategory, PaymentMethod, Person, CancelReason, Property, ServiceCategory, Tag, VisitStep, Supplier } from "@/data/types";
import { COMPANY_STORED_COLUMNS, companyToDb, contactToDb, licenseToDb } from "./companyMap";
import { supabase } from "./client";
import { expenseCategoryToDb, pages } from "./repo";
import { classify } from "@/data/outboxRetry";
import { companyModulesFromRows, moduleDef, moduleState } from "@/modules/registry";
import { MODULE_INACTIVE } from "@/data/outboxRetry";

export type Op =
  /** at: when the tech left (step en_route), phone time — visits.en_route_at (П3c) */
  | { k: "visit.step"; visitId: string; to: VisitStep; at?: string }
  | { k: "photo.add"; id: string; visitId: string; jobId?: string; stage: "before" | "after"; uri?: string }
  | { k: "photo.remove"; id: string }
  /** the whole list at once — what the app sent before step 14; kept for ops still in old queues (the server's
   *  legacy trigger moves only ticks and new optional items of it into the rows, migration 20261108140000) */
  | { k: "visit.checklist"; visitId: string; checklist: { id: string; label: string; done: boolean }[] }
  /**
   * step 14 (docs/specs/08 §11.3): a tick, a skip, the photos of items of one visit — an UPDATE of the rows only
   * (never an upsert: a tech's write would be checked by the insert policy). `at` — the phone's time of the change; the
   * server takes it only at the tick / skip itself, and writes who. addPhotoId: one photo added to the item's photos on
   * the server (read and merged there — never the phone's whole array: two people adding photos would drop one).
   */
  | { k: "chk.item.set"; visitId: string; itemIds: string[]; done?: boolean; skipped?: boolean; naReason?: NaReason | null; naText?: string | null; addPhotoId?: string; at: string }
  /** a new item of a visit (the office's; a tech's own — always optional) */
  | { k: "chk.item.add"; item: { id: string; visitId: string; position: number; label: string; kind: ChecklistItemKind; required: boolean; hint?: string; templateId?: string; templateName?: string } }
  /** the office edits an item before the visit (§7.4, CH3): only the fields it names; «required» off — the director */
  | { k: "chk.item.edit"; id: string; visitId: string; label?: string; required?: boolean; position?: number }
  /** an item removed (soft: deleted_at, undo 5 s) */
  | { k: "chk.item.remove"; id: string; visitId: string }
  /** «Просмотрено» on the «not done» card (at = null: «Отменить»); the server writes who */
  | { k: "chk.visit.review"; visitId: string; at: string | null }
  /** the photo minimums of the visit's templates, with the snapshot (S4, S9; docs/specs/08 §11.7 №7); null — the company's */
  | { k: "chk.visit.mins"; visitId: string; before: number | null; after: number | null }
  /** an estimate template, whole (owner, admin, office; docs/specs/07 §11); archive = archivedAt */
  | { k: "est.template.save"; template: EstimateTemplate }
  /** a checklist template, whole (owner, admin, office) */
  /** ifNew: a module's starter (fixed id) — inserted once, never over the office's edits (another phone added it first) */
  | { k: "chk.template.save"; template: ChecklistTemplate; ifNew?: boolean }
  /** spec 36: a supplier made, changed, archived or restored (the whole row) */
  | { k: "supplier.save"; supplier: Supplier }
  /** spec 37: a purchase order made or changed (header, its lines, the lines taken out) */
  | { k: "po.save"; order: PurchaseOrder; removedLineIds: string[] }
  /** spec 37: what came, line by line (public.po_receive) */
  | { k: "po.receive"; id: string; lines: { id: string; received: string }[] }
  /** the company's photo rules, whole (owner, admin) */
  | { k: "company.visitSettings"; settings: VisitSettings }
  | { k: "visit.sign"; visitId: string; svg: string }
  /** dueDate: the company's day when the invoice was made (offline at 11:50 PM it stays that day); older queued ops have none */
  | { k: "visit.pay"; visitId: string; jobId: string; customerId: string; invoiceId: string; paymentId: string; amountCents: number; method: PaymentMethod; dueDate?: string }
  | { k: "lead.reply"; leadId: string }
  | {
      k: "lead.book";
      leadId: string;
      customerId: string;
      contactId: string;
      propertyId: string;
      jobId: string;
      visitId: string;
      name: string;
      phone: string;
      sourceId: string;
      address: string;
      city: string;
      message: string;
      start: string;
    }
  /** S4 (docs/specs/03): an inspection — a visit of the lead at the property, no job; replaces lead.visit (kept for old queues) */
  | { k: "visit.notified"; visitId: string }
  | { k: "visit.inspection"; leadId?: string; propertyId: string; visitId: string; start: string; durationMin: number; techId: string | null; assigneeIds?: string[]; note?: string; scope: string[] }
  /** the office cancels a visit with a reason; S4a / S9a roll the lead / job back when nothing open is left */
  | { k: "visit.cancel"; visitId: string; reason: CancelReason; text?: string; leadBack?: string; jobBack?: string }
  /** the office moves a visit (time, length); the status does not change */
  | { k: "visit.reschedule"; visitId: string; start: string; durationMin: number; allDay?: boolean }
  /** estimate visit for a lead whose client and property already exist (lead.prospect or earlier); replaced by visit.inspection */
  | {
      k: "lead.visit";
      leadId: string;
      customerId: string;
      propertyId: string;
      jobId: string;
      visitId: string;
      start: string;
      durationMin: number;
      techId: string | null;
      scope: string[];
    }
  | { k: "lead.add"; id: string; name: string; phone: string; city: string; address?: string; sourceId: string; message: string; costCents?: number; cols?: Record<string, unknown> }
  /** the whole list of people on a visit (wave П3a, public.assign_visit); userId — old queues with one person */
  | { k: "visit.assign"; visitId: string; userIds?: string[]; userId?: string }
  | {
      k: "estimate.add";
      id: string;
      versionId: string;
      optionId: string;
      customerId: string;
      propertyId: string;
      title: string;
      totalCents: number;
      depositCents?: number;
      marginPct?: string | null;
      lines: { name: string; qty: string; totalCents: number; optional?: boolean }[];
    }
  | { k: "estimate.send"; id: string; token?: string }
  | {
      k: "estimate.save";
      id: string;
      versionId: string;
      customerId: string;
      propertyId: string;
      leadId?: string;
      /** E3: made from this template (version source = 'template'; the server counts the use) */
      templateId?: string;
      title: string;
      /** client-visible content (no costs) */
      doc: EstimateDoc;
      /** line id → unit cost incl. supplier tax (estimate_line_costs, hidden from tech) */
      costs: Record<string, number>;
      /** a sent estimate edited: new line id → the line of the sent version it was copied from (the server copies its
       *  cost to the new line for who cannot write costs — migration 20261108200000, debt 4); absent in older builds */
      linesFrom?: Record<string, string>;
      totalCents: number;
      depositCents: number;
      marginPct: string | null;
    }
  | {
      k: "estimate.approve";
      id: string;
      token: string;
      optionId: string;
      addonIds: string[];
      signer: string;
      svg: string;
      channel: "on_site" | "portal";
      jobId: string;
      invoiceId?: string;
    }
  | { k: "payment.record"; id: string; invoiceId: string; customerId: string; amountCents: number; method: PaymentMethod; reference?: string }
  | { k: "invoice.issue"; id: string; jobId: string; customerId: string; kind: "progress" | "final"; title: string; totalCents: number; dueDate?: string }
  | { k: "job.schedule"; jobId: string; visitId: string; start: string; end: string; techId: string | null; assigneeIds?: string[]; note?: string; scope: string[]; allDay?: boolean }
  | { k: "company.save"; company: Company; einChanged: boolean; /** the zone was chosen (docs/specs/22 §1.3); absent in older ops */ tzChanged?: boolean }
  | { k: "license.save"; license: CompanyLicense }
  | { k: "license.remove"; id: string }
  | { k: "contact.save"; contact: CompanyContact }
  | { k: "contact.remove"; id: string }
  | {
      k: "lead.prospect";
      leadId: string; customerId: string; contactId: string; propertyId: string;
      name: string; phone: string; email?: string; sourceId: string; address: string; city: string;
    }
  | {
      k: "lead.convert";
      leadId: string; needCustomer: boolean; customerId: string; contactId: string; propertyId: string; noteId: string;
      name: string; phone: string; email?: string; sourceId: string; address: string; city: string; note: string;
    }
  /** columns of public.leads already in DB names (mapped by the store) */
  | { k: "lead.update"; id: string; cols: Record<string, unknown> }
  // wave 6-2: a call carries its outcome, and may carry the person, minutes and a note (the app never sends a call without an outcome)
  | { k: "lead.touch"; activityId: string; leadId: string; kind: "call" | "sms" | "email" | "marketplace" | "reply"; at: string; outcome?: CallOutcome; contactId?: string; durationMin?: number; note?: string }
  | { k: "activity.message"; activityId: string; subjectType: "customer" | "job"; subjectId: string; at: string; channel: "sms" | "email"; text: string; contactId?: string }
  | { k: "activity.call"; activityId: string; subjectType: "customer" | "job"; subjectId: string; at: string; outcome: CallOutcome; contactId?: string; durationMin?: number; note?: string }
  | { k: "invoice.remind"; activityId: string; customerId: string; invoiceId: string; channel: "sms" | "email"; at: string }
  | { k: "lead.close"; leadId: string; status: "lost" | "declined"; reason: string; text?: string; activityId: string; from: string }
  | { k: "lead.reopen"; leadId: string; activityId: string; from: string }
  | { k: "lead.assign"; leadId: string; userId: string; activityId: string }
  | { k: "lead.cost"; leadId: string; cents: number }
  | { k: "lead.contactSave"; leadId: string; contact: { id: string; name: string; role: string; phone?: string; email?: string } }
  | { k: "lead.contactRemove"; id: string }
  | { k: "task.save"; task: { id: string; subjectType: string; subjectId: string; title: string; dueAt?: string; assigneeId?: string; doneAt?: string; startsAt?: string; endsAt?: string; allDay?: boolean; description?: string } }
  // wave П-2b: events and days off; own fields (owner / admin) and their values (staff)
  | { k: "calendarEvent.save"; event: CalendarEvent; isNew: boolean }
  | { k: "calendarEvent.remove"; id: string }
  /** wave 7б-1: my personal settings in this company (public.set_my_prefs: only for yourself) */
  | { k: "me.prefs"; prefs: MemberPrefs }
  /** wave 7б-2: my location consent (public.set_location_consent: only for yourself; on — after the notice) */
  | { k: "me.location"; on: boolean }
  /** step 18 P4b: my push switch of one group (public.set_push_kind: only for yourself, an active member) */
  | { k: "me.pushKind"; kind: PushGroup; enabled: boolean }
  /** spec 33 П15 (C2a): owner / admin switch an add-on module on (the first time — the 7-day trial) or off; its settings
   *  (only while it is active — founder О2; baseRowVersion = the version edited, a newer one is a conflict) */
  | { k: "module.enable"; module: string }
  | { k: "module.disable"; module: string }
  | { k: "module.saveSettings"; module: string; settings: Record<string, unknown>; baseRowVersion: number }
  /** spec 33 П15 C2c: a change of an add-on module, sent by the module's own handler (ModuleDef.ops). coalesceKey: a newer
   *  change with the same key replaces a waiting one in the queue (a drawn line: one write per element, not per move).
   *  made: the ids it creates — later ops that refer to them wait for it (outboxDeps). */
  | { k: "module.op"; module: string; kind: string; payload: Record<string, unknown>; coalesceKey?: string; made?: string[] }
  | { k: "customField.save"; field: CustomField; isNew: boolean }
  | { k: "customFieldValue.save"; value: CustomFieldValue; isNew: boolean }
  | { k: "customFieldValue.remove"; id: string }
  | { k: "source.save"; source: { id: string; name: string; kind: string; phone?: string; email?: string; customerId?: string; note?: string; active: boolean; position?: number } }
  | {
      k: "customer.create";
      customerId: string; contactId: string; propertyId: string;
      name: string; phone: string; email?: string; sourceId: string; address: string; city: string;
    }
  // wave П-1: name parts and the address for invoices (billing null = same as the property)
  | { k: "customer.update"; id: string; name?: string; phone?: string; email?: string; firstName?: string; lastName?: string; companyName?: string; billing?: BillingAddress | null; taxExempt?: boolean; taxExemptNote?: string; sourceId?: string }
  | { k: "customer.people"; id: string; people: Person[] }
  | { k: "lead.people"; id: string; people: Person[] }
  | { k: "customer.tags"; id: string; tagIds: string[] }
  | { k: "customer.status"; id: string; status: CustomerStatus; reason?: string }
  /** step 17 C3 (docs/specs/04 §13): everything of dropId moves to keepId (public.merge_customers; a repeat changes nothing) */
  | { k: "customer.merge"; keepId: string; dropId: string }
  /** «not a duplicate»: one more id on the card's list (public.mark_not_duplicate; never the whole list — two devices) */
  | { k: "customer.notDup"; id: string; otherId: string }
  | { k: "tag.save"; tag: Tag }
  | { k: "serviceCategory.save"; category: ServiceCategory; isNew: boolean }
  | { k: "job.category"; id: string; serviceCategoryId: string | null }
  /** wave 3b (S17): a job without an estimate, one server function (public.create_job; a repeat returns the same job) */
  /** wave 3c (S10): the office closes the job (public.complete_job; a repeat on a closed job changes nothing) */
  | { k: "job.complete"; id: string }
  | { k: "job.create"; id: string; customerId: string; propertyId: string; title: string; description: string | null; jobTypeId: string | null; serviceCategoryId: string | null }
  // wave П-1 (13 §5): description and type of a job; the company's list of job types
  | { k: "job.update"; id: string; description?: string | null; jobTypeId?: string | null; taxEnabled?: boolean; taxRateBps?: number }
  // wave П-2a: tags and own lines of a job (the server counts line and job totals)
  | { k: "job.tags"; id: string; tagIds: string[] }
  | { k: "jobLine.save"; line: Omit<JobLineItem, "totalCents">; isNew: boolean }
  | { k: "jobLine.remove"; id: string }
  /** «Undo» of a removed line (rule 5) */
  | { k: "jobLine.restore"; id: string }
  | { k: "jobType.save"; jobType: JobType; isNew: boolean }
  | { k: "estimate.category"; id: string; serviceCategoryId: string | null }
  | { k: "property.update"; id: string; address?: string; city?: string }
  | { k: "property.save"; property: Omit<Property, "gateCode"> }
  | { k: "property.gate"; id: string; code: string }
  | { k: "note.add"; id: string; subjectType: string; subjectId: string; body: string; visibility: "team" | "private" }
  | { k: "note.update"; id: string; pinned?: boolean; body?: string; deleted?: boolean }
  /** onlyNew (spec 33 П22.10): «insert, or nothing if this id is there» — a module's items made with a fixed id; a second
   *  phone or a second send never overwrites a price someone already set */
  /**
   * costs: the cost fields this save changed (19 §9) — only these are written; a field left out keeps the server's value
   * (a cache without costs never erases them). No `costs` (an op queued by an older build): every cost field as before.
   */
  | { k: "catalog.save"; item: CatalogItem; onlyNew?: true; costs?: CatalogCostChange }
  | { k: "catalog.remove"; id: string }
  | { k: "notice.read"; ids: string[] }
  | { k: "estimate.sign"; id: string; svg: string; signer?: string }
  /* ---- wave E2a: the company signs; the client link can be revoked (docs/specs/07 §2.2 А, Б) ---- */
  | { k: "estimate.countersign"; id: string; svg?: string; memberSignatureId?: string; jobId?: string; invoiceId?: string }
  | { k: "estimate.revoke"; id: string }
  /* ---- wave E2b-1 ---- */
  | { k: "estimate.decline"; id: string; text: string }
  | { k: "estimate.reopen"; id: string; reason: string }
  /* ---- wave E2b-2 ---- */
  | { k: "member.signature"; id: string; userId: string; svg: string; name: string; title?: string }
  | { k: "member.update"; id: string; title?: string; hisNumber?: string; canSignContracts?: boolean }
  | {
      k: "estimate.deposit";
      id: string;
      jobId: string;
      invoiceId: string;
      paymentId: string;
      method: PaymentMethod;
      customerId: string;
      propertyId: string;
      title: string;
      totalCents: number;
      depositCents: number;
      /** the company's day the deposit invoice was made (see visit.pay) */
      dueDate?: string;
    }
  | { k: "invoice.pay"; invoiceId: string; paymentId: string; customerId: string; amountCents: number; method: PaymentMethod }
  | { k: "expense.add"; id: string; jobId: string | null; vendor: string; category: ExpenseCategory; amountCents: number };

export interface OutboxItem {
  id: string;
  op: Op;
  at: string;
  tries: number;
  error?: string;
}


/**
 * An answer of the server that is not «done», with its HTTP status and its code (PostgREST / Postgres), so the outbox
 * can tell a refusal from «try later» (src/data/outboxRetry.ts; review #244). Status 0 — no answer at all.
 */
export class ServerError extends Error {
  override name = "ServerError";
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    /** the server's hint (e.g. row_version_conflict — outboxRetry.classify reads it before the code) */
    readonly hint?: string,
  ) {
    super(message);
  }
}
/** A refusal that will not change on retry (permission, constraint, a broken row): counted, dropped after the tries. */
export class PermanentError extends ServerError {
  override name = "PermanentError";
}

/** is the company's module active on the server now (= app.module_active)? undefined — the read failed */
async function moduleActiveOnServer(companyId: string, module: string): Promise<boolean | undefined> {
  try {
    // one row (company, module key is unique); read() throws on a failed request → «not known»
    const { data } = await read(supabase.from("company_modules").select("module_key, enabled, trial_ends_at, paid_until, settings, row_version").eq("company_id", companyId).eq("module_key", module).maybeSingle());
    // the phone's clock may run ahead of the server's: near the trial's end judge it 10 minutes late, so another refusal
    // is never read as «not active» (then it stays a plain refusal — review M5a)
    const a = moduleState(companyModulesFromRows(data ? [data as Record<string, unknown>] : [])[module], Date.now() - 10 * 60_000).access;
    return a === "trial" || a === "paid";
  } catch {
    return undefined;
  }
}

/** the sign-in expired (401 / PGRST301): renew it quietly before the outbox tries again (review #244) */
export async function renewSession(): Promise<void> {
  await supabase.auth?.refreshSession?.().catch(() => {});
}

async function run(p: PromiseLike<{ error: { message: string; code?: string; hint?: string } | null; status?: number }>) {
  const { error, status } = await p;
  if (!error) return;
  // «someone else changed it first» (40001 + hint row_version_conflict, module_save_settings): a retry never helps —
  // the server's «no», the queue drops it and reads the truth (spec 33 П15.3); a plain 40001 is a serialization retry
  const permanent = error.code ? /^(42|23|22|P0)/.test(error.code) || error.hint === "row_version_conflict" : false;
  if (permanent) throw new PermanentError(error.message, status, error.code, error.hint);
  throw new ServerError(error.message, status, error.code, error.hint);
}

/**
 * A read inside an op: a failed request (dropped connection, server error) is not «no row» — it stops the op through
 * run(), like a failed write, so nothing is written on a guess (second deposit invoice, second primary contact, a locked
 * version edited as open). supabase-js gives `{ data: null, error }` here, not an exception.
 */
async function read<R extends { error: { message: string; code?: string } | null; status?: number }>(p: PromiseLike<R>): Promise<R> {
  const r = await p;
  await run(Promise.resolve({ error: r.error, status: r.status }));
  return r;
}

/** people on a new visit: the same server function as «Назначить» (nobody → nothing to send) */
async function assignPeople(visitId: string, ids: string[]) {
  if (ids.length) await run(supabase.rpc("assign_visit", { p_visit_id: visitId, p_user_ids: ids }));
}

/** the columns of one chk.item.set (only what the op says; the server sets who and keeps the time after the change) */
export function chkItemPatch(op: Extract<Op, { k: "chk.item.set" }>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (op.done !== undefined) {
    row.done = op.done;
    if (op.done) row.done_at = op.at;
  }
  if (op.skipped !== undefined) {
    row.skipped = op.skipped;
    if (op.skipped) {
      row.na_at = op.at;
      row.na_reason = op.naReason ?? null;
      row.na_text = cleanText(op.naText ?? "") || null;
    }
  }
  return row;
}

/** a template → its row (docs/specs/08 §3.1; server checklist_templates) */
export function templateToDb(t: ChecklistTemplate, companyId: string): Record<string, unknown> {
  return {
    id: t.id, company_id: companyId, name: cleanText(t.name, TEMPLATE_NAME_MAX),
    items: t.items.map((i) => ({ id: i.id, label: cleanText(i.label), kind: i.kind, required: i.required, ...(cleanText(i.hint) ? { hint: cleanText(i.hint) } : {}) })),
    applies_every_visit: t.appliesTo.everyVisit, applies_visit_kinds: t.appliesTo.visitKinds, applies_catalog_item_ids: t.appliesTo.catalogItemIds,
    min_photos_before: t.minPhotosBefore ?? null, min_photos_after: t.minPhotosAfter ?? null,
    module_key: t.module ?? null, archived_at: t.archivedAt ?? null,
  };
}

/** an estimate template → its row (server estimate_templates). The doc carries unitCostCents only for who sees costs
 *  (toTemplateDoc): the server moves them to estimate_template_line_costs and keeps a line's cost when the key is absent. */
export function estimateTemplateToDb(t: EstimateTemplate, companyId: string): Record<string, unknown> {
  const doc = t.costs
    ? { ...t.doc, options: t.doc.options.map((o) => ({ ...o, lines: o.lines.map((l) => (t.costs![l.id] !== undefined ? { ...l, unitCostCents: t.costs![l.id] } : l)) })) }
    : t.doc;
  return { id: t.id, company_id: companyId, name: cleanText(t.name, TEMPLATE_NAME_MAX), doc, module_key: t.module ?? null, archived_at: t.archivedAt ?? null };
}
async function saveEstimateTemplate(t: EstimateTemplate, c: string) {
  // module_key only on insert (no update grant, an upsert would send it in the update too): insert if new (a retry or
  // another phone's insert does nothing), then the update of what may change
  const row = estimateTemplateToDb(t, c);
  const { module_key: _m, id: _id, company_id: _c, ...upd } = row;
  await run(ins("estimate_templates", row));
  return run(supabase.from("estimate_templates").update(upd).eq("id", t.id));
}

/** Insert by client-made id; a retry after a partial failure does not duplicate rows (ON CONFLICT DO NOTHING). */
function ins(table: string, row: Record<string, unknown>) {
  return supabase.from(table).upsert(row, { onConflict: "id", ignoreDuplicates: true });
}

const JOB_PATH = ["draft", "scheduled", "in_progress", "completed"];
async function advanceJob(jobId: string, to: "scheduled" | "in_progress" | "completed") {
  if (!realJob(jobId)) return;
  const { data } = await read(supabase.from("jobs").select("status").eq("id", jobId).maybeSingle());
  let cur = (data?.status as string | undefined) ?? "draft";
  let i = JOB_PATH.indexOf(cur);
  const target = JOB_PATH.indexOf(to);
  while (i >= 0 && i < target) {
    i += 1;
    cur = JOB_PATH[i]!;
    await run(supabase.from("jobs").update({ status: cur }).eq("id", jobId));
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Source id of the company. Ops queued by older builds carried the source name ("Thumbtack") — resolve those by name. */
async function sourceRef(companyId: string, op: { sourceId?: string; source?: string }): Promise<string> {
  const v = op.sourceId ?? op.source ?? "";
  if (UUID.test(v)) return v;
  // every source of the company, page by page (they grow with imports and marketplaces; PostgREST gives ≤ 1000 at once)
  const rows = await pages<{ id: string; name: string }>(() => supabase.from("lead_sources").select("id, name").eq("company_id", companyId), [{ col: "id" }]).catch(
    (e: unknown) => {
      // a dropped connection is not «the company has no sources»: the op waits and is retried. A refusal keeps the old
      // way (the lead is saved without a source) — dropping the whole lead after MAX_TRIES would lose more.
      if (classify(e) !== "refusal") throw e;
      return [] as { id: string; name: string }[];
    },
  );
  const name = v.replace(/^src-/, "").toLowerCase();
  return (rows.find((r) => r.name.toLowerCase() === name) ?? rows.find((r) => r.name === "Website") ?? rows[0])?.id ?? "";
}

/** a photo's bytes to Storage and its files row marked; shared with modules (a measurement's photo, spec 33 П21.10) */
export async function uploadPhoto(companyId: string, fileId: string, uri: string) {
  let blob: Blob;
  try {
    blob = await (await fetch(uri)).blob();
  } catch {
    // the photo is gone from the phone: nothing to send again
    return run(supabase.from("files").update({ upload_status: "failed" }).eq("id", fileId));
  }
  try {
    const key = `${companyId}/${fileId}.jpg`;
    const { error } = await supabase.storage.from("files").upload(key, blob, { contentType: blob.type || "image/jpeg", upsert: true });
    if (error) throw error;
    await run(supabase.from("files").update({ storage_key: key, upload_status: "uploaded", mime: blob.type || "image/jpeg", size: blob.size }).eq("id", fileId));
  } catch (e) {
    // no network or the server's «not now»: the op stays in the queue and the upload is tried again (upsert: true);
    // only a refusal marks the photo failed
    if (classify(e) !== "refusal") throw e;
    await run(supabase.from("files").update({ upload_status: "failed" }).eq("id", fileId));
  }
}

/** task.save → the time columns (wave П-2b); an end without a start is not sent (the server refuses it) */
/** the columns of an outgoing event: the outcome and minutes of a call in meta, the person, the note as the body (20 §3) */
export function callCols(op: { at: string; outcome?: CallOutcome; contactId?: string; durationMin?: number; note?: string }): Record<string, unknown> {
  const meta: Record<string, string> = {};
  if (op.outcome) meta.outcome = op.outcome;
  if (op.durationMin && op.durationMin > 0) meta.duration_min = String(Math.round(op.durationMin));
  return {
    direction: "out", at: op.at, meta,
    // a person the app made up for an old client / lead (`<id>-main`) is not a contact row: never sent (20 §3)
    ...(op.contactId && !op.contactId.endsWith("-main") ? { contact_id: op.contactId } : {}),
    ...(op.note?.trim() ? { body: op.note.trim() } : {}),
  };
}

export function taskTimeCols(t: { startsAt?: string; endsAt?: string; allDay?: boolean; description?: string }) {
  return {
    starts_at: t.startsAt ?? null, ends_at: t.startsAt ? t.endsAt ?? null : null, all_day: !!t.allDay, description: t.description?.trim() || null,
  };
}

/** customer.update → the customers columns it changes (wave П-1: first / last / company name, billing_address_*) */
export function customerCols(op: Extract<Op, { k: "customer.update" }>): Record<string, string | boolean | null> {
  const cols: Record<string, string | boolean | null> = {};
  if (op.name !== undefined) cols.display_name = op.name;
  if (op.firstName !== undefined) cols.first_name = op.firstName.trim() || null;
  if (op.lastName !== undefined) cols.last_name = op.lastName.trim() || null;
  if (op.companyName !== undefined) cols.company_name = op.companyName.trim() || null;
  // wave 4: the source changed in the client form; a cloud source is always a uuid (repo.ts), a demo name never reaches here
  if (op.sourceId !== undefined && UUID.test(op.sourceId)) cols.lead_source_id = op.sourceId;
  if (op.taxExempt !== undefined) cols.tax_exempt = op.taxExempt;
  if (op.taxExemptNote !== undefined) cols.tax_exempt_note = op.taxExemptNote.trim() || null;
  if (op.billing !== undefined) {
    const b = op.billing;
    Object.assign(cols, {
      billing_address_line1: b?.line1.trim() || null, billing_address_line2: b?.line2?.trim() || null, billing_address_unit: b?.unit?.trim() || null,
      billing_address_city: b?.city.trim() || null, billing_address_state: b?.state?.trim() || null, billing_address_zip: b?.zip?.trim() || null,
    });
  }
  return cols;
}

export async function applyOp(op: Op, companyId: string, userId: string): Promise<void> {
  const c = companyId;
  switch (op.k) {
    case "visit.step": {
      // «on the way» carries the phone time; an op queued by an older build has none — the server notes now() (migration 20261105360000)
      if (op.to === "en_route") return run(supabase.from("visits").update(op.at ? { status: op.to, en_route_at: op.at } : { status: op.to }).eq("id", op.visitId));
      if (op.to === "on_site") return run(supabase.from("visits").update({ status: op.to }).eq("id", op.visitId));
      if (op.to === "working") return run(supabase.from("visits").update({ work_started_at: new Date().toISOString() }).eq("id", op.visitId));
      // an inspection ends on site: completed (S10); a job visit with nothing to pay ends here too
      if (op.to === "done") return run(supabase.from("visits").update({ status: "completed" }).eq("id", op.visitId).eq("status", "on_site"));
      return;
    }
    case "photo.add": {
      await run(
        ins("files", { id: op.id, company_id: c, kind: "photo", visit_id: op.visitId, job_id: realJob(op.jobId), stage: op.stage, taken_at: new Date().toISOString() }),
      );
      if (op.uri) await uploadPhoto(c, op.id, op.uri);
      return;
    }
    case "photo.remove":
      return run(supabase.from("files").update({ deleted_at: new Date().toISOString() }).eq("id", op.id));
    case "visit.checklist":
      return run(supabase.from("visits").update({ checklist: op.checklist }).eq("id", op.visitId));
    case "chk.item.set": {
      if (!op.itemIds.length) return;
      const row = chkItemPatch(op);
      if (op.addPhotoId) {
        // the photos of one item: what the server has now + this one (a retry adds nothing twice)
        const { data } = await read(supabase.from("visit_checklist_items").select("photo_ids").eq("visit_id", op.visitId).eq("id", op.itemIds[0]!).maybeSingle());
        const now = ((data as { photo_ids?: string[] | null } | null)?.photo_ids ?? []).filter((x) => x !== op.addPhotoId);
        row.photo_ids = [...now, op.addPhotoId].slice(-20);
      }
      return run(supabase.from("visit_checklist_items").update(row).eq("visit_id", op.visitId).in("id", op.itemIds));
    }
    case "chk.item.add": {
      const it = op.item;
      return run(
        ins("visit_checklist_items", {
          id: it.id, company_id: c, visit_id: it.visitId, position: it.position, label: cleanText(it.label), kind: it.kind, required: it.required,
          hint: cleanText(it.hint) || null, template_id: it.templateId ?? null, template_name: cleanText(it.templateName, TEMPLATE_NAME_MAX) || null,
        }),
      );
    }
    case "chk.item.edit": {
      const row: Record<string, unknown> = {};
      const label = op.label === undefined ? "" : cleanText(op.label);
      if (label) row.label = label;
      if (op.required !== undefined) row.required = op.required;
      if (op.position !== undefined) row.position = Math.max(0, Math.min(100000, Math.round(op.position)));
      if (!Object.keys(row).length) return;
      return run(supabase.from("visit_checklist_items").update(row).eq("id", op.id).eq("visit_id", op.visitId));
    }
    case "chk.item.remove":
      return run(supabase.from("visit_checklist_items").update({ deleted_at: new Date().toISOString() }).eq("id", op.id).eq("visit_id", op.visitId));
    case "chk.visit.review":
      return run(supabase.from("visits").update({ checklist_reviewed_at: op.at }).eq("id", op.visitId));
    case "chk.visit.mins": {
      const r = await supabase.from("visits").update({ checklist_min_photos_before: op.before, checklist_min_photos_after: op.after }).eq("id", op.visitId);
      // a server before migration 20261108150000 has no such columns: the minimums stay on the phone, the queue goes on
      if (r.error && (r.error.code === "PGRST204" || r.error.code === "42703")) return;
      return run(Promise.resolve(r));
    }
    case "est.template.save":
      return saveEstimateTemplate(op.template, c);
    case "po.save":
      return savePurchaseOrder(op, c);
    case "po.receive": {
      const { error, status } = await supabase.rpc("po_receive", { p_po_id: op.id, p_lines: op.lines.map((l) => ({ id: l.id, received: Number(l.received) })) });
      return run(Promise.resolve({ error, status }));
    }
    case "supplier.save":
      return run(supabase.from("suppliers").upsert(supplierToRow(op.supplier, c), { onConflict: "id" }));
    case "chk.template.save":
      return run(supabase.from("checklist_templates").upsert(templateToDb(op.template, c), { onConflict: "id", ...(op.ifNew ? { ignoreDuplicates: true } : {}) }));
    case "company.visitSettings":
      return run(supabase.from("companies").update({ visit_settings: op.settings }).eq("id", c));
    case "visit.sign":
      return run(supabase.from("visits").update({ signed_at: new Date().toISOString(), signature_svg: op.svg }).eq("id", op.visitId));
    case "visit.pay": {
      // the job is not moved here: «На месте» starts it (visit trigger), the office closes it (complete_job) — S10
      await run(
        ins("invoices", {
          id: op.invoiceId, company_id: c, customer_id: op.customerId, job_id: realJob(op.jobId), kind: "final", status: "sent",
          subtotal_cents: op.amountCents, total_cents: op.amountCents, due_date: op.dueDate ?? companyToday(), sent_at: new Date().toISOString(),
        }),
      );
      await run(
        ins("payments", {
          id: op.paymentId, company_id: c, invoice_id: op.invoiceId, customer_id: op.customerId, visit_id: op.visitId,
          method: op.method, amount_cents: op.amountCents, status: "succeeded", idempotency_key: op.paymentId, received_by: userId,
        }),
      );
      await run(supabase.from("visits").update({ status: "completed" }).eq("id", op.visitId));
      return;
    }
    case "lead.reply":
      // older queued op: "I replied" — the activity trigger records the first response
      return run(ins("activities", { company_id: c, subject_type: "lead", subject_id: op.leadId, kind: "reply", direction: "out" }));
    case "lead.book": {
      const src = await sourceRef(c, op);
      await run(ins("customers", { id: op.customerId, company_id: c, display_name: op.name, lead_source_id: src || null }));
      await run(ins("contacts", { id: op.contactId, company_id: c, customer_id: op.customerId, name: op.name, phone: op.phone, is_primary: true }));
      await run(supabase.from("customers").update({ primary_contact_id: op.contactId }).eq("id", op.customerId));
      await run(
        ins("properties", { id: op.propertyId, company_id: c, customer_id: op.customerId, address_line1: op.address || op.city || "—", address_city: op.city || "—", stories: 1 }),
      );
      // an inspection is a visit of the lead at the property, without a job (as visit.inspection, 20261105280000); the app
      // inserts no job any more (17-job §12.1, 20261107040000) — op.jobId of an old queue is not used
      const end = new Date(new Date(op.start).getTime() + 45 * 60000).toISOString();
      await run(
        ins("visits", {
          id: op.visitId, company_id: c, lead_id: op.leadId, property_id: op.propertyId, kind: "inspection", starts_at: op.start, ends_at: end, scope: op.message ? [op.message] : [],
        }),
      );
      return run(supabase.from("leads").update({ status: "inspection_scheduled", customer_id: op.customerId, property_id: op.propertyId }).eq("id", op.leadId));
    }
    case "visit.inspection": {
      const end = new Date(new Date(op.start).getTime() + op.durationMin * 60000).toISOString();
      await run(ins("visits", { id: op.visitId, company_id: c, lead_id: op.leadId ?? null, property_id: op.propertyId, kind: "inspection", starts_at: op.start, ends_at: end, scope: op.scope, notes: op.note ?? null }));
      // the lead first, the people last: a refused assignment must not leave the lead behind (security check of П3a)
      if (op.leadId) {
        await run(supabase.from("leads").update({ first_response_at: op.start < new Date().toISOString() ? op.start : new Date().toISOString(), first_response_kind: "manual" }).eq("id", op.leadId).is("first_response_at", null));
        await run(supabase.from("leads").update({ status: "inspection_scheduled" }).eq("id", op.leadId).in("status", ["new", "contacted", "qualified"]));
      }
      return assignPeople(op.visitId, op.assigneeIds ?? (op.techId ? [op.techId] : []));
    }
    case "visit.cancel":
      // one server function for S4a / S9a (migration 20261105300000): the cancel and the roll-backs in one transaction;
      // a repeat after a partial failure changes nothing
      return run(supabase.rpc("cancel_visit", { p_visit_id: op.visitId, p_reason: op.reason, p_text: op.text ?? null }));
    case "visit.notified":
      // the time is the server's (t07_visit_notified_stamp sets now()); any non-null value only marks «told»
      return run(supabase.from("visits").update({ customer_notified_at: new Date(0).toISOString() }).eq("id", op.visitId));
    case "visit.reschedule": {
      const end = new Date(new Date(op.start).getTime() + op.durationMin * 60000).toISOString();
      // all_day is sent always by this version (false clears it); the server keeps it only on whole days (t03_visit_all_day)
      return run(supabase.from("visits").update({ starts_at: op.start, ends_at: end, all_day: !!op.allDay }).eq("id", op.visitId));
    }
    case "lead.visit": {
      // the same as lead.book: an inspection without a job (17-job §12.1); op.jobId of an old queue is not used
      const end = new Date(new Date(op.start).getTime() + op.durationMin * 60000).toISOString();
      await run(ins("visits", { id: op.visitId, company_id: c, lead_id: op.leadId, property_id: op.propertyId, kind: "inspection", starts_at: op.start, ends_at: end, scope: op.scope }));
      // upsert: a replay after a partial failure must not die on unique (visit_id, user_id)
      if (op.techId) await run(supabase.from("visit_assignees").upsert({ company_id: c, visit_id: op.visitId, user_id: op.techId }, { onConflict: "visit_id,user_id", ignoreDuplicates: true }));
      // booking a visit is an answer to the client (same as the app); only the first one counts
      await run(supabase.from("leads").update({ first_response_at: op.start < new Date().toISOString() ? op.start : new Date().toISOString(), first_response_kind: "manual" }).eq("id", op.leadId).is("first_response_at", null));
      // only an open lead before "estimate sent" moves to "inspection scheduled"
      return run(supabase.from("leads").update({ status: "inspection_scheduled" }).eq("id", op.leadId).in("status", ["new", "contacted", "qualified"]));
    }
    case "lead.add": {
      const src = await sourceRef(c, op);
      await run(
        ins("leads", {
          id: op.id, company_id: c, source_id: src, contact_name: op.name, phone: op.phone,
          address_text: [op.address, op.city].filter(Boolean).join(", "), message: op.message,
          ...(op.cols ?? {}),
        }),
      );
      if (op.costCents) await run(supabase.from("lead_costs").upsert({ lead_id: op.id, company_id: c, cost_cents: op.costCents }, { onConflict: "lead_id" }));
      return;
    }
    case "lead.update":
      return run(supabase.from("leads").update(op.cols).eq("id", op.id));
    case "lead.touch":
      // the server sets first_response_at and moves new → contacted (trigger on activities)
      // an unanswered call / voicemail only counts an attempt (meta.outcome, migration 20261104130000)
      return run(ins("activities", { id: op.activityId, company_id: c, subject_type: "lead", subject_id: op.leadId, kind: op.kind, ...callCols(op) }));
    case "activity.message":
      // wave 6-3: an SMS / email opened in the phone's app, on a client or a job (RLS: like a call); the text is the body
      return run(ins("activities", { id: op.activityId, company_id: c, subject_type: op.subjectType, subject_id: op.subjectId, kind: op.channel, ...callCols({ at: op.at, contactId: op.contactId, note: op.text }) }));
    case "activity.call":
      // wave 6-2: a call on a client or a job (RLS: staff; a tech only on the job of his visit, with that job's person)
      return run(ins("activities", { id: op.activityId, company_id: c, subject_type: op.subjectType, subject_id: op.subjectId, kind: "call", ...callCols(op) }));
    case "invoice.remind":
      // S20 (wave 8): a reminder is an outgoing event in the client's feed, linked to the invoice by meta (no migration: check and RLS allow it)
      return run(ins("activities", { id: op.activityId, company_id: c, subject_type: "customer", subject_id: op.customerId, kind: op.channel, direction: "out", at: op.at, meta: { invoiceId: op.invoiceId, reminder: "1" } }));
    case "lead.close":
      await run(supabase.from("leads").update({ status: op.status, lost_reason: op.reason, lost_reason_text: op.text ?? null }).eq("id", op.leadId));
      return run(ins("activities", { id: op.activityId, company_id: c, subject_type: "lead", subject_id: op.leadId, kind: "status", meta: { from: op.from, to: op.status, reason: op.reason } }));
    case "lead.reopen":
      await run(supabase.from("leads").update({ status: "contacted", lost_reason: null, lost_reason_text: null }).eq("id", op.leadId));
      return run(ins("activities", { id: op.activityId, company_id: c, subject_type: "lead", subject_id: op.leadId, kind: "status", meta: { from: op.from, to: "replied" } }));
    case "lead.assign":
      await run(supabase.from("leads").update({ assigned_to: op.userId }).eq("id", op.leadId));
      return run(ins("activities", { id: op.activityId, company_id: c, subject_type: "lead", subject_id: op.leadId, kind: "assigned", meta: { to: op.userId } }));
    case "lead.cost":
      return run(supabase.from("lead_costs").upsert({ lead_id: op.leadId, company_id: c, cost_cents: op.cents }, { onConflict: "lead_id" }));
    case "lead.people":
      // all people of a lead in one transaction (migration 20261105120000); the lead caches the main phone / email
      return run(supabase.rpc("save_lead_people", { p_lead_id: op.id, p_people: op.people }));
    // older queued ops (before L2 part 2): the migration copied lead_contacts once, so these still land somewhere readable
    case "lead.contactSave":
      return run(
        supabase.from("lead_contacts").upsert(
          { id: op.contact.id, company_id: c, lead_id: op.leadId, name: op.contact.name, role: op.contact.role, phone: op.contact.phone ?? null, email: op.contact.email ?? null },
          { onConflict: "id" },
        ),
      );
    case "lead.contactRemove":
      return run(supabase.from("lead_contacts").update({ deleted_at: new Date().toISOString() }).eq("id", op.id));
    case "task.save":
      return run(
        supabase.from("tasks").upsert(
          {
            id: op.task.id, company_id: c, subject_type: op.task.subjectType, subject_id: op.task.subjectId, title: op.task.title,
            due_at: op.task.dueAt ?? null, assignee_id: op.task.assigneeId ?? null, done_at: op.task.doneAt ?? null, // done_by: the server (S26, 20261107060000)
            ...taskTimeCols(op.task),
          },
          { onConflict: "id" },
        ),
      );
    case "calendarEvent.save": {
      const x = op.event;
      const cols = {
        kind: x.kind, user_id: x.userId ?? null, title: x.title?.trim() || null, description: x.description?.trim() || null,
        starts_at: x.startsAt, ends_at: x.endsAt, all_day: x.allDay,
      };
      return run(op.isNew ? ins("calendar_events", { id: x.id, company_id: c, ...cols }) : supabase.from("calendar_events").update(cols).eq("id", x.id));
    }
    case "me.prefs":
      return run(supabase.rpc("set_my_prefs", { p_company_id: c, p_plan_show_done: op.prefs.planShowDone }));
    case "me.location":
      return run(supabase.rpc("set_location_consent", { p_company_id: c, p_on: op.on }));
    case "me.pushKind":
      return run(supabase.rpc("set_push_kind", { p_company_id: c, p_kind: op.kind, p_enabled: op.enabled }));
    case "module.enable":
      return run(supabase.rpc("module_enable", { p_company_id: c, p_module_key: op.module }));
    case "module.disable":
      return run(supabase.rpc("module_disable", { p_company_id: c, p_module_key: op.module }));
    case "module.op": {
      const handler = moduleDef(op.module)?.ops;
      // an app without the module (an older version, a module removed): the server would get nothing it knows — a try
      if (!handler) throw new PermanentError(`no handler for ${op.module}.${op.kind}`, 400, "22023");
      try {
        return await handler({ kind: op.kind, payload: op.payload }, { companyId: c, userId, run });
      } catch (e) {
        // RLS says 42501 both for «not allowed» and for «the module is not active» (founder О2): after a refusal read the
        // module's row — not active → module_inactive, and the queue drops this module's waiting changes at once instead of
        // five tries each (spec 33 П21.1). A failed read says nothing: the refusal stays as it was.
        if (classify(e) === "refusal" && (await moduleActiveOnServer(c, op.module)) === false)
          throw new PermanentError(`module ${op.module} is not active`, 403, "42501", MODULE_INACTIVE);
        throw e;
      }
    }
    case "module.saveSettings":
      return run(supabase.rpc("module_save_settings", { p_company_id: c, p_module_key: op.module, p_settings: op.settings, p_base_row_version: op.baseRowVersion }));
    case "calendarEvent.remove":
      return run(supabase.from("calendar_events").update({ deleted_at: new Date().toISOString() }).eq("id", op.id));
    case "customField.save": {
      // what a field is (entity, type) is set once (column grants and t05_custom_field_guard, migration 20261106030000)
      const x = op.field;
      const common = { label: x.label.trim(), options: x.options, group_name: x.group?.trim() || null, searchable: x.searchable, position: x.position, archived_at: x.archivedAt ?? null };
      return run(op.isNew ? ins("custom_fields", { id: x.id, company_id: c, entity: x.entity, type: x.type, ...common }) : supabase.from("custom_fields").update(common).eq("id", x.id));
    }
    case "customFieldValue.save": {
      const x = op.value;
      return run(
        op.isNew
          ? ins("custom_field_values", { id: x.id, company_id: c, field_id: x.fieldId, entity_id: x.entityId, value: x.value })
          : supabase.from("custom_field_values").update({ value: x.value, deleted_at: null }).eq("id", x.id),
      );
    }
    case "customFieldValue.remove":
      return run(supabase.from("custom_field_values").update({ deleted_at: new Date().toISOString() }).eq("id", op.id));
    case "source.save":
      return run(
        supabase.from("lead_sources").upsert(
          {
            id: op.source.id, company_id: c, name: op.source.name, kind: op.source.kind, phone: op.source.phone ?? null, email: op.source.email ?? null,
            customer_id: op.source.customerId ?? null, note: op.source.note ?? null, is_active: op.source.active, position: op.source.position ?? 100,
          },
          { onConflict: "id" },
        ),
      );
    case "visit.assign":
      // the whole list in one transaction (migration 20261105320000): taken off = deleted_at; a replay changes nothing
      return run(supabase.rpc("assign_visit", { p_visit_id: op.visitId, p_user_ids: op.userIds ?? (op.userId ? [op.userId] : []) }));
    case "estimate.add": {
      await run(
        ins("estimates", { id: op.id, company_id: c, customer_id: op.customerId, property_id: op.propertyId, title: op.title, created_via: "drawing", number: "" }),
      );
      await run(
        ins("estimate_versions", {
          id: op.versionId, company_id: c, estimate_id: op.id, version_no: 1, source: "drawing", engine_version: "0.1.0",
          totals: { total: op.totalCents, deposit: op.depositCents ?? 0, marginPct: op.marginPct ?? null },
          deposit_rule: { kind: "pct", value: "0.1", contractType: "ca_hic" }, contract_type: "ca_home_improvement",
        }),
      );
      await run(ins("estimate_options", { id: op.optionId, company_id: c, version_id: op.versionId, name: op.title.split(":")[0] ?? "Option", is_recommended: true }));
      const { count } = await read(supabase.from("estimate_line_items").select("id", { count: "exact", head: true }).eq("option_id", op.optionId));
      if (op.lines.length && !count) {
        await run(
          supabase.from("estimate_line_items").insert(
            op.lines.map((l, i) => {
              const qty = Number(l.qty) || 1;
              return {
                company_id: c, option_id: op.optionId, position: i, name: l.name, quantity: qty,
                unit_price_cents: Math.round(l.totalCents / qty), is_optional: !!l.optional, origin: "assembly",
              };
            }),
          ),
        );
      }
      return run(supabase.from("estimates").update({ current_version_id: op.versionId }).eq("id", op.id));
    }
    case "estimate.save":
      return saveEstimate(op, c);
    case "estimate.approve": {
      if (op.channel === "on_site") {
        // the client signs on an employee's device (spec 35 §4д п.10). The office sends first, as before (a draft gets its
        // locked version; lines that changed are refused by send). A tech may not send — the office did: that refusal is
        // not the end. Then the signature by the estimate's id: no token, the server checks who holds the device.
        try {
          await applyOp({ k: "estimate.send", id: op.id, token: op.token }, c, userId);
        } catch (e) {
          if (!(e instanceof PermanentError && e.code === "42501")) throw e;
        }
        const { error, status } = await supabase.rpc("accept_on_site", {
          p_estimate_id: op.id, p_option_id: op.optionId, p_addon_ids: op.addonIds, p_signer: op.signer, p_svg: op.svg, p_consent: true,
          p_job_id: op.jobId, p_invoice_id: op.invoiceId ?? null,
        });
        // a server without the door yet (PostgREST «no such function»): the old way — by the token, as before
        if (error?.code !== "PGRST202") return run(Promise.resolve({ error, status }));
      }
      await applyOp({ k: "estimate.send", id: op.id, token: op.token }, c, userId);
      const { error, status } = await supabase.rpc("portal_accept", {
        p_token: op.token, p_option_id: op.optionId, p_addon_ids: op.addonIds, p_signer: op.signer, p_svg: op.svg, p_consent: true,
        p_channel: op.channel, p_job_id: op.jobId, p_visit_id: null, p_invoice_id: op.invoiceId ?? null,
      });
      return run(Promise.resolve({ error, status }));
    }
    case "job.complete":
      return run(supabase.rpc("complete_job", { p_job_id: op.id }));
    case "job.create":
      return run(
        supabase.rpc("create_job", {
          p_job_id: op.id, p_customer_id: op.customerId, p_property_id: op.propertyId, p_title: op.title,
          p_description: op.description, p_job_type_id: op.jobTypeId, p_service_category_id: op.serviceCategoryId,
        }),
      );
    case "job.schedule": {
      await run(ins("visits", { id: op.visitId, company_id: c, job_id: op.jobId, kind: "install", starts_at: op.start, ends_at: op.end, all_day: !!op.allDay, scope: op.scope, notes: op.note ?? null }));
      await advanceJob(op.jobId, "scheduled");
      return assignPeople(op.visitId, op.assigneeIds ?? (op.techId ? [op.techId] : []));
    }
    case "company.save": {
      const { data: stored } = await read(supabase.from("companies").select([...COMPANY_STORED_COLUMNS, "timezone"].join(", ")).eq("id", c).maybeSingle());
      await run(supabase.from("companies").update(companyToDb(op.company, (stored ?? {}) as Record<string, unknown>, op.tzChanged)).eq("id", c));
      if (op.einChanged) {
        const ein = op.company.ein?.trim() || null;
        await run(supabase.from("company_secrets").upsert({ company_id: c, ein }, { onConflict: "company_id" }));
      }
      return;
    }
    case "license.save":
      return run(supabase.from("company_licenses").upsert(licenseToDb(op.license, c), { onConflict: "id" }));
    case "license.remove":
      return run(supabase.from("company_licenses").update({ deleted_at: new Date().toISOString() }).eq("id", op.id));
    case "contact.save": {
      if (op.contact.isPrimary) await run(supabase.from("company_contacts").update({ is_primary: false }).eq("company_id", c).neq("id", op.contact.id));
      return run(supabase.from("company_contacts").upsert(contactToDb(op.contact, c, 0), { onConflict: "id" }));
    }
    case "contact.remove":
      return run(supabase.from("company_contacts").update({ deleted_at: new Date().toISOString() }).eq("id", op.id));
    case "payment.record":
      return run(
        ins("payments", {
          id: op.id, company_id: c, invoice_id: op.invoiceId, customer_id: op.customerId, method: op.method, amount_cents: op.amountCents,
          status: "succeeded", idempotency_key: op.id, received_by: userId, reference: op.reference ?? null,
        }),
      );
    case "invoice.issue":
      return run(
        ins("invoices", {
          id: op.id, company_id: c, number: "", customer_id: op.customerId, job_id: op.jobId, kind: op.kind, status: "sent", title: op.title,
          subtotal_cents: op.totalCents, total_cents: op.totalCents, due_date: op.dueDate ?? companyToday(), sent_at: new Date().toISOString(),
        }),
      );
    case "lead.prospect": {
      await createCustomer(c, op, "prospect");
      return run(supabase.from("leads").update({ customer_id: op.customerId, property_id: op.propertyId }).eq("id", op.leadId));
    }
    case "lead.convert": {
      if (op.needCustomer) await createCustomer(c, op, "active");
      else await run(supabase.from("customers").update({ status: "active" }).eq("id", op.customerId).eq("status", "prospect"));
      await run(
        supabase.from("leads").update({ status: "won", won_via: "manual", customer_id: op.customerId, property_id: op.propertyId }).eq("id", op.leadId).not("status", "in", "(won,lost,declined,archived)"),
      );
      return run(ins("notes", { id: op.noteId, company_id: c, subject_type: "customer", subject_id: op.customerId, body: op.note, visibility: "team" }));
    }
    case "customer.create":
      return createCustomer(c, op, "active");
    case "customer.update": {
      const cols = customerCols(op);
      if (Object.keys(cols).length) await run(supabase.from("customers").update(cols).eq("id", op.id));
      if (op.phone !== undefined || op.email !== undefined) {
        const patch: Record<string, string | null> = {};
        if (op.phone !== undefined) patch.phone = op.phone || null;
        if (op.email !== undefined) patch.email = op.email || null;
        const { data: primary } = await read(supabase.from("contacts").select("id").eq("customer_id", op.id).eq("is_primary", true).is("deleted_at", null).maybeSingle());
        if (primary?.id) await run(supabase.from("contacts").update(patch).eq("id", primary.id));
        else await run(supabase.from("contacts").insert({ company_id: c, customer_id: op.id, name: op.name ?? "—", is_primary: true, ...patch }));
      }
      return;
    }
    // one transaction each on the server: a refused phone or tag never leaves the client half-saved
    case "customer.people":
      return run(supabase.rpc("save_customer_people", { p_customer_id: op.id, p_people: op.people }));
    case "customer.tags":
      return run(supabase.rpc("set_customer_tags", { p_customer_id: op.id, p_tag_ids: op.tagIds }));
    case "customer.status":
      return run(supabase.from("customers").update({ status: op.status, do_not_service_reason: op.status === "do_not_service" ? op.reason || "—" : null }).eq("id", op.id));
    case "customer.merge":
      return run(supabase.rpc("merge_customers", { p_keep: op.keepId, p_drop: op.dropId }));
    case "customer.notDup":
      return run(supabase.rpc("mark_not_duplicate", { p_id: op.id, p_other: op.otherId }));
    case "serviceCategory.save": {
      // seed_key is set once; afterwards only name, position and archive change (column grants, migration 20261105250000)
      const x = op.category;
      const common = { name: x.name ?? null, position: x.position, archived_at: x.archivedAt ?? null };
      return run(
        op.isNew
          ? ins("service_categories", { id: x.id, company_id: c, seed_key: x.seedKey ?? null, ...common })
          : supabase.from("service_categories").update(common).eq("id", x.id),
      );
    }
    case "job.update": {
      const cols: Record<string, string | null> = {};
      if (op.description !== undefined) cols.description = op.description?.trim() || null;
      if (op.jobTypeId !== undefined) cols.job_type_id = op.jobTypeId;
      const money: Record<string, boolean | number> = {};
      if (op.taxEnabled !== undefined) money.tax_enabled = op.taxEnabled;
      if (op.taxRateBps !== undefined) money.tax_rate_bps = op.taxRateBps;
      if (Object.keys(money).length) return run(supabase.from("jobs").update({ ...cols, ...money }).eq("id", op.id));
      return Object.keys(cols).length ? run(supabase.from("jobs").update(cols).eq("id", op.id)) : undefined;
    }
    case "job.tags":
      return run(supabase.rpc("set_job_tags", { p_job_id: op.id, p_tag_ids: op.tagIds }));
    case "jobLine.save": {
      // a line stays on its job: only a new line names it (column grants, migration 20261106020000)
      const l = op.line;
      const cols = {
        position: l.position, name: l.name.trim() || "—", description: l.description?.trim() || null,
        catalog_item_id: l.catalogItemId ?? null, quantity: jobLineQty(l.quantity), unit_price_cents: l.unitPriceCents, taxable: l.taxable,
      };
      return run(op.isNew ? ins("job_line_items", { id: l.id, company_id: c, job_id: l.jobId, ...cols }) : supabase.from("job_line_items").update(cols).eq("id", l.id));
    }
    case "jobLine.remove":
      return run(supabase.from("job_line_items").update({ deleted_at: new Date().toISOString() }).eq("id", op.id));
    case "jobLine.restore":
      return run(supabase.from("job_line_items").update({ deleted_at: null }).eq("id", op.id));
    case "jobType.save": {
      // seed_key is set once; afterwards only name, position and archive change (column grants, migration 20261106010000)
      const x = op.jobType;
      const common = { name: x.name?.trim() || null, position: x.position, archived_at: x.archivedAt ?? null };
      return run(
        op.isNew
          ? ins("job_types", { id: x.id, company_id: c, seed_key: x.seedKey ?? null, ...common })
          : supabase.from("job_types").update(common).eq("id", x.id),
      );
    }
    case "job.category":
      return run(supabase.from("jobs").update({ service_category_id: op.serviceCategoryId }).eq("id", op.id));
    case "estimate.category":
      return run(supabase.from("estimates").update({ service_category_id: op.serviceCategoryId }).eq("id", op.id));
    case "tag.save":
      return run(
        supabase.from("tags").upsert(
          { id: op.tag.id, company_id: c, name: op.tag.name, is_active: op.tag.active, position: op.tag.position },
          { onConflict: "id" },
        ),
      );
    case "property.save": {
      const p = op.property;
      const place = p.place ?? { city: p.city };
      return run(
        supabase.from("properties").upsert(
          {
            id: p.id, company_id: c, customer_id: p.customerId, address_line1: p.address || "—", address_unit: p.unit ?? null,
            address_city: place.city || "—", address_state: place.state || "CA", address_zip: place.zip || null,
            label: p.label ?? null, kind: p.kind ?? null, access_notes: p.accessNotes ?? null, contact_ids: p.contactIds ?? [], stories: p.stories || 1,
          },
          { onConflict: "id" },
        ),
      );
    }
    case "property.gate":
      // kept apart from the property (migration 20261105160000): the office writes it, a tech reads it only on the visit days
      return run(supabase.from("property_secrets").upsert({ property_id: op.id, company_id: c, gate_code: op.code || null, deleted_at: null }, { onConflict: "property_id" }));
    case "property.update": {
      const patch: Record<string, string> = {};
      if (op.address !== undefined) patch.address_line1 = op.address || "—";
      if (op.city !== undefined) patch.address_city = op.city || "—";
      return run(supabase.from("properties").update(patch).eq("id", op.id));
    }
    case "note.add":
      return run(ins("notes", { id: op.id, company_id: c, subject_type: op.subjectType, subject_id: op.subjectId, body: op.body, visibility: op.visibility }));
    case "note.update": {
      const patch: Record<string, unknown> = {};
      if (op.pinned !== undefined) patch.pinned = op.pinned;
      if (op.body !== undefined) patch.body = op.body;
      if (op.deleted) patch.deleted_at = new Date().toISOString();
      return run(supabase.from("notes").update(patch).eq("id", op.id));
    }
    case "catalog.save": {
      const it = op.item;
      const costCols = catalogCostCols(op);
      await run(
        supabase.from("catalog_items").upsert(
          {
            id: it.id, company_id: c, kind: it.kind, name: it.name, description: it.description ?? null, unit: it.unit,
            unit_price_cents: it.priceCents, vendor: it.vendor ?? null, ...costCols,
            components: (it.components ?? []).map((x) => ({ item_id: x.itemId, qty: x.qty })), is_placeholder_price: !!it.placeholder,
            // C3 (docs/specs/33 П16): only what is set — an item without them never writes the new columns
            ...(it.attributes !== undefined ? { attributes: it.attributes } : {}),
            ...(it.purchaseUnit !== undefined ? { purchase_unit: it.purchaseUnit.trim() || null } : {}),
            ...(it.packSize !== undefined ? { pack_size: it.packSize || null } : {}),
            // spec 36: the same — only once set ("" = cleared)
            ...(it.supplierId !== undefined ? { supplier_id: it.supplierId || null } : {}),
            ...(it.supplierSku !== undefined ? { supplier_sku: it.supplierSku || null } : {}),
          },
          // onlyNew: INSERT … ON CONFLICT (id) DO NOTHING — the row there stays as it is; a refusal (RLS) stays a refusal
          op.onlyNew ? { onConflict: "id", ignoreDuplicates: true } : { onConflict: "id" },
        ),
      );
      if (!op.onlyNew) {
        // 19 §9: the server moves a cost sent above into catalog_item_costs, but a null there means «not sent» (old
        // phones); the changed fields go to the side table as they are, so a cost can be cleared. Nothing changed —
        // nothing written (an upsert sets only the columns it sends). No right to see costs (42501, sales) or a server
        // before the migration (no table) — the item itself is saved.
        if (!op.costs || !Object.keys(costCols).length) return;
        const r = await supabase.from("catalog_item_costs").upsert({ item_id: it.id, company_id: c, ...costCols }, { onConflict: "item_id" });
        if (r.error && !["42501", "42P01", "PGRST205"].includes(r.error.code ?? "")) await run(Promise.resolve(r));
        return;
      }
      // «nothing» is not «done» (security check #377): the row with this id must now be this company's
      const { data: row } = await read(supabase.from("catalog_items").select("id, deleted_at").eq("id", it.id).eq("company_id", c).maybeSingle());
      // not visible: the id is another company's row (RLS hides it) — the item was never made; the server's «no»
      if (!row) throw new PermanentError("catalog item id is taken", 409, "23505", "id_taken");
      // our own row deleted before: back in the list as it was — its price and properties are not touched
      if ((row as { deleted_at: string | null }).deleted_at) {
        await run(supabase.from("catalog_items").update({ deleted_at: null, is_active: true }).eq("id", it.id).eq("company_id", c));
      }
      return;
    }
    case "catalog.remove":
      return run(supabase.from("catalog_items").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", op.id));
    case "notice.read":
      return run(supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", op.ids));
    case "estimate.send": {
      // E2a, security-check 05.11: the server locks the version, sets "valid until" and the link token
      // (it takes the phone's token only if it was never revoked; otherwise makes its own — the next refresh brings it)
      const { error, status } = await supabase.rpc("send_estimate", { p_estimate_id: op.id, p_token: op.token ?? null });
      await run(Promise.resolve({ error, status }));
      // a lost connection here is «try later», never «no lead» (review #244)
      const { data: est } = await read(supabase.from("estimates").select("lead_id").eq("id", op.id).maybeSingle());
      if (est?.lead_id) {
        await run(
          supabase.from("leads").update({ status: "estimate_sent" }).eq("id", est.lead_id).in("status", ["new", "contacted", "qualified", "inspection_scheduled"]),
        );
      }
      return;
    }
    case "estimate.sign": {
      // a quick estimate signed on site: the server records the client's signature and the total (sign_estimate_on_site);
      // the app no longer writes the signature or the status directly (security-check 05.11)
      await applyOp({ k: "estimate.send", id: op.id }, c, userId);
      const { error, status } = await supabase.rpc("sign_estimate_on_site", { p_estimate_id: op.id, p_signer: op.signer ?? "Client", p_svg: op.svg });
      return run(Promise.resolve({ error, status }));
    }
    case "estimate.countersign": {
      const { error, status } = await supabase.rpc("countersign_estimate", {
        p_estimate_id: op.id, p_svg: op.svg ?? null, p_member_signature_id: op.memberSignatureId ?? null, p_job_id: op.jobId ?? null, p_invoice_id: op.invoiceId ?? null,
      });
      return run(Promise.resolve({ error, status }));
    }
    case "member.signature":
      // own signature only (RLS); the previous one is revoked by the server trigger
      return run(ins("member_signatures", { id: op.id, company_id: c, user_id: op.userId, svg: op.svg, name: op.name, title: op.title ?? null }));
    case "member.update": {
      const patch: Record<string, unknown> = {};
      if (op.title !== undefined) patch.title = op.title.trim() || null;
      if (op.hisNumber !== undefined) patch.his_registration_number = op.hisNumber.trim() || null;
      if (op.canSignContracts !== undefined) patch.can_sign_contracts = op.canSignContracts;
      if (!Object.keys(patch).length) return;
      return run(supabase.from("memberships").update(patch).eq("company_id", c).eq("user_id", op.id));
    }
    case "estimate.decline": {
      const { error, status } = await supabase.rpc("decline_countersign", { p_estimate_id: op.id, p_text: op.text });
      return run(Promise.resolve({ error, status }));
    }
    case "estimate.reopen": {
      const { error, status } = await supabase.rpc("reopen_estimate", { p_estimate_id: op.id, p_reason: op.reason || null });
      return run(Promise.resolve({ error, status }));
    }
    case "estimate.revoke": {
      const { error, status } = await supabase.rpc("revoke_estimate_link", { p_estimate_id: op.id });
      return run(Promise.resolve({ error, status }));
    }
    case "estimate.deposit":
      // one server function (17-job §12.1, 20261107040000): the job and the deposit invoice are the signature's; the payment is
      // the balance of that invoice as the server knows it; a replay with the same payment id changes nothing. Not signed on
      // the server → P0001, a refusal: the op is dropped, the phone reloads and the estimate shows its deposit as due again
      // (never a silent «received»). The app inserts no job any more.
      return run(supabase.rpc("record_estimate_deposit", { p_estimate_id: op.id, p_payment_id: op.paymentId, p_method: op.method }));
    case "invoice.pay":
      return run(
        ins("payments", {
          id: op.paymentId, company_id: c, invoice_id: op.invoiceId, customer_id: op.customerId, method: op.method,
          amount_cents: op.amountCents, status: "succeeded", idempotency_key: op.paymentId, received_by: userId,
        }),
      );
    case "expense.add":
      return run(
        ins("expenses", {
          id: op.id, company_id: c, job_id: realJob(op.jobId), vendor: op.vendor, category: expenseCategoryToDb[op.category],
          amount_cents: op.amountCents, idempotency_key: op.id,
        }),
      );
  }
}

/** the cost fields of a price-list item (CatalogItem) and their columns */
export type CatalogCostChange = Partial<Record<"costCents" | "vendorTaxBps" | "markupBps", number | null>>;
const COST_COL = { costCents: "unit_cost_cents", vendorTaxBps: "vendor_tax_bps", markupBps: "markup_bps" } as const;
/** what changed between the item on the phone before and now (a new item: what it has); empty — nothing */
export function catalogCostChange(prev: CatalogItem | undefined, it: CatalogItem): CatalogCostChange {
  const out: CatalogCostChange = {};
  for (const f of Object.keys(COST_COL) as (keyof typeof COST_COL)[]) {
    const now = it[f] ?? null;
    if (prev ? now !== (prev[f] ?? null) : now !== null) out[f] = now;
  }
  return out;
}
/** the cost columns a save writes: the changed ones; an old op without `costs` — all of them, as it did */
function catalogCostCols(op: Extract<Op, { k: "catalog.save" }>): Record<string, number | null> {
  const ch: CatalogCostChange = op.costs ?? { costCents: op.item.costCents ?? null, vendorTaxBps: op.item.vendorTaxBps ?? null, markupBps: op.item.markupBps ?? null };
  return Object.fromEntries((Object.keys(ch) as (keyof typeof COST_COL)[]).map((f) => [COST_COL[f], ch[f] ?? null]));
}

/**
 * Draft estimate → database: estimate row, an unlocked version (a new one if the current is already sent),
 * options and line items mirrored from the doc (same ids), costs in the restricted side table.
 * The doc without costs is kept in estimate_versions.calc_inputs for the app and the client page.
 */
/** A line's quantity as estimate_line_items keeps it; a text that is not a number goes as before (the server says no). */
const storedQty = (q: DecLike): string | number => {
  try {
    return jobLineQty(q);
  } catch {
    return Number(q as string);
  }
};
async function saveEstimate(op: Extract<Op, { k: "estimate.save" }>, c: string) {
  await run(
    ins("estimates", { id: op.id, company_id: c, customer_id: op.customerId, property_id: op.propertyId, lead_id: op.leadId ?? null, title: op.title, created_via: op.templateId ? "template" : "manual", number: "" }),
  );
  // the connection dropped after the insert: «try later», never «not visible» (that would drop the estimate, review #244)
  const { data: est } = await read(supabase.from("estimates").select("status, current_version_id").eq("id", op.id).maybeSingle());
  if (!est) throw new PermanentError("estimate is not visible");
  // «don't sign — change it» (E2a): the client signed, the company changes it → back to draft on the server, signature kept in history
  if (est.status === "awaiting_countersign") {
    const { error, status } = await supabase.rpc("reopen_estimate", { p_estimate_id: op.id, p_reason: null });
    await run(Promise.resolve({ error, status }));
    est.status = "draft";
  }
  if (!["draft", "sent", "viewed"].includes(est.status as string)) return;
  if (est.status !== "draft") await run(supabase.from("estimates").update({ status: "draft" }).eq("id", op.id));
  let versionId = est.current_version_id as string | null;
  if (versionId) {
    const { data: v } = await read(supabase.from("estimate_versions").select("locked_at, version_no").eq("id", versionId).maybeSingle());
    if (v?.locked_at) {
      const { data: last } = await read(supabase.from("estimate_versions").select("version_no").eq("estimate_id", op.id).order("version_no", { ascending: false }).limit(1).maybeSingle());
      await run(ins("estimate_versions", { id: op.versionId, company_id: c, estimate_id: op.id, version_no: Number(last?.version_no ?? 1) + 1 }));
      versionId = op.versionId;
    }
  } else {
    await run(ins("estimate_versions", { id: op.versionId, company_id: c, estimate_id: op.id, version_no: 1 }));
    versionId = op.versionId;
  }
  const s = op.doc.settings;
  const taxOn = s.tax.enabled && Object.values(s.tax.groups).some(Boolean);
  await run(
    supabase
      .from("estimate_versions")
      .update({
        calc_inputs: op.doc, engine_version: ENGINE_VERSION,
        // E3: the server counts a use on version 1 (estimate_template_uses); every save keeps the same source
        source: op.templateId ? "template" : "scratch", template_id: op.templateId ?? null, intro_text: op.doc.note ?? null,
        totals: { total: op.totalCents, deposit: op.depositCents, marginPct: op.marginPct },
        tax_enabled: taxOn, tax_rate_bps: s.tax.rateBps, tax_mode: "added_on_top", deposit_rule: s.deposit,
        contract_type: s.caHic ? "ca_home_improvement" : "non_hic",
      })
      .eq("id", versionId),
  );
  await run(supabase.from("estimates").update({ title: op.title, current_version_id: versionId }).eq("id", op.id));

  // Replace options and lines of this (unlocked) version.
  const { data: oldOpts } = await read(supabase.from("estimate_options").select("id").eq("version_id", versionId));
  const oldIds = ((oldOpts ?? []) as { id: string }[]).map((o) => o.id);
  if (oldIds.length) {
    await run(supabase.from("estimate_line_items").delete().in("option_id", oldIds));
    await run(supabase.from("estimate_options").delete().in("id", oldIds));
  }
  if (!op.doc.options.length) return;
  await run(
    supabase.from("estimate_options").insert(
      op.doc.options.map((o, i) => ({
        id: o.id, company_id: c, version_id: versionId, name: o.name, position: i, is_recommended: !!o.recommended,
        discount_mode: s.discount ? s.discount.kind : null,
        discount_value: s.discount ? (s.discount.kind === "pct" ? discountBps(s.discount.value) : s.discount.cents) : null,
      })),
    ),
  );
  const lines = op.doc.options.flatMap((o) =>
    o.lines
      .filter((l) => l.name.trim() !== "" || l.unitPriceCents !== 0)
      .map((l, i) => ({
        id: l.id, company_id: c, option_id: o.id, position: i, line_group: l.group, catalog_item_id: null,
        origin: l.catalogItemId ? "catalog" : "manual", name: l.name.trim() || "—", description: l.description ?? null,
        // the stored quantity (numeric(14,4)) — the same the engine counts (Н1): the lock check finds no difference
        quantity: storedQty(l.quantity), unit: l.unit || "ea", unit_price_cents: l.unitPriceCents,
        taxable: taxOn && !!s.tax.groups[l.group], is_optional: !!l.optional,
        // only when this save made new ids for a sent estimate (debt 4): the column stays out of older builds' rows
        ...(op.linesFrom?.[l.id] ? { copied_from_line_id: op.linesFrom[l.id] } : {}),
      })),
  );
  if (lines.length) {
    const r = await supabase.from("estimate_line_items").insert(lines);
    // a server before migration 20261108200000 has no copied_from_line_id: the lines go without it (the cost is not
    // copied — as before), never a save that keeps failing and leaves a draft with no lines (director's review #420 №1)
    const noColumn = r.error && (r.error.code === "PGRST204" || r.error.code === "42703") && lines.some((l) => "copied_from_line_id" in l);
    if (noColumn) await run(supabase.from("estimate_line_items").insert(lines.map(({ copied_from_line_id: _, ...l }) => l)));
    else await run(Promise.resolve(r));
  }
  const costRows = lines.filter((l) => op.costs[l.id] !== undefined).map((l) => ({ line_item_id: l.id, company_id: c, unit_cost_cents: op.costs[l.id] }));
  if (costRows.length) {
    // Tech without "view costs" cannot write costs (42501): the estimate itself is still saved. Any other failure
    // (no network, the server's «not now») stops the op — a resend replaces the lines and writes the costs again.
    const r = await supabase.from("estimate_line_costs").upsert(costRows, { onConflict: "line_item_id" });
    if (r.error?.code !== "42501") await run(Promise.resolve(r));
  }
}

/** Customer + primary contact + property (lead → prospect / client). */
async function createCustomer(
  c: string,
  op: { customerId: string; contactId: string; propertyId: string; name: string; phone: string; email?: string; sourceId: string; address: string; city: string },
  status: "prospect" | "active",
) {
  const src = await sourceRef(c, op);
  await run(ins("customers", { id: op.customerId, company_id: c, display_name: op.name, lead_source_id: src || null, status }));
  await run(ins("contacts", { id: op.contactId, company_id: c, customer_id: op.customerId, name: op.name, phone: op.phone, email: op.email ?? null, is_primary: true }));
  await run(supabase.from("customers").update({ primary_contact_id: op.contactId }).eq("id", op.customerId));
  await run(ins("properties", { id: op.propertyId, company_id: c, customer_id: op.customerId, address_line1: op.address || op.city || "—", address_city: op.city || "—", stories: 1 }));
}

/** wave 7б-2: a location point goes straight away, never through the offline queue — an old point is worthless, and the
 *  server skips one older than 5 min anyway. user_id and company_id come from the server (migration 20261106210000). */
export async function sendVisitPoint(p: { visitId: string; lat: number; lng: number; accuracyM?: number; at: string; source: "status_change" | "foreground" }): Promise<"ok" | "off" | "error"> {
  try {
    const { error } = await supabase.from("user_locations").insert({
      visit_id: p.visitId, lat: p.lat, lng: p.lng, accuracy_m: p.accuracyM ?? null, source: p.source, recorded_at: p.at,
    });
    if (!error) return "ok";
    // the server's own text (migration 20261106210000): sharing is off for me or for the company
    return /location sharing is off/.test(error.message) ? "off" : "error";
  } catch {
    return "error";
  }
}

/**
 * spec 37: an order → database. The header first (the lines point to it), then the lines as they are, the lines taken
 * out (deleted_at; the app has no DELETE), and the expected costs — only for who sees costs (42501 for the others:
 * the order itself is saved). A server before the migration has no table: the whole op is a «no» (the store does not
 * send it there: purchaseOrdersLegacy).
 */
async function savePurchaseOrder(op: Extract<Op, { k: "po.save" }>, c: string) {
  const o = op.order;
  // made as a draft if new (the server makes every new order a draft, t26), then changed to what the phone has: an
  // upsert would carry the forced draft into the update (EXCLUDED holds what BEFORE INSERT made)
  const row = poToRow(o, c);
  await run(supabase.from("purchase_orders").upsert(row, { onConflict: "id", ignoreDuplicates: true }));
  const { id: _id, company_id: _c, ...patch } = row;
  await run(supabase.from("purchase_orders").update(patch).eq("id", o.id).eq("company_id", c));
  // a closed order's lines are not sent (the server keeps them as they are anyway — review SUP2-а №1)
  if (!poLinesEditable(o)) return;
  if (o.lines.length) {
    await run(supabase.from("purchase_order_lines").upsert(o.lines.map((l) => poLineToRow(l, o.id, c)), { onConflict: "id" }));
  }
  if (op.removedLineIds.length) {
    await run(supabase.from("purchase_order_lines").update({ deleted_at: new Date().toISOString() }).in("id", op.removedLineIds).eq("company_id", c));
  }
  const costs = o.lines.filter((l) => l.costCents !== undefined).map((l) => ({ line_id: l.id, company_id: c, unit_cost_cents: l.costCents }));
  if (costs.length) {
    const r = await supabase.from("purchase_order_line_costs").upsert(costs, { onConflict: "line_id" });
    if (r.error && !["42501", "42P01", "PGRST205"].includes(r.error.code ?? "")) await run(Promise.resolve(r));
  }
}
