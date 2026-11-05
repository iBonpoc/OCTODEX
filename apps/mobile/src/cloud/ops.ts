/**
 * Outbox operations: every change made on the phone is applied locally at once and recorded here,
 * then sent to the OCTODEX database when online (offline-first, docs/06-architecture, ADR-003).
 * Ops are idempotent where money is involved (payments carry idempotency_key = payment id).
 */
import { ENGINE_VERSION } from "@octo/estimating-engine";
import type { CallOutcome, CatalogItem, Company, CompanyContact, CompanyLicense, CustomerStatus, EstimateDoc, ExpenseCategory, PaymentMethod, Person, Property, Tag, VisitStep } from "@/data/types";
import { companyToDb, contactToDb, licenseToDb } from "./companyMap";
import { supabase } from "./client";
import { expenseCategoryToDb } from "./repo";

export type Op =
  | { k: "visit.step"; visitId: string; to: VisitStep }
  | { k: "photo.add"; id: string; visitId: string; jobId: string; stage: "before" | "after"; uri?: string }
  | { k: "photo.remove"; id: string }
  | { k: "visit.checklist"; visitId: string; checklist: { id: string; label: string; done: boolean }[] }
  | { k: "visit.sign"; visitId: string; svg: string }
  | { k: "visit.pay"; visitId: string; jobId: string; customerId: string; invoiceId: string; paymentId: string; amountCents: number; method: PaymentMethod }
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
  /** estimate visit for a lead whose client and property already exist (lead.prospect or earlier); replaces lead.book */
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
  | { k: "visit.assign"; visitId: string; userId: string }
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
      title: string;
      /** client-visible content (no costs) */
      doc: EstimateDoc;
      /** line id → unit cost incl. supplier tax (estimate_line_costs, hidden from tech) */
      costs: Record<string, number>;
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
  | { k: "invoice.issue"; id: string; jobId: string; customerId: string; kind: "progress" | "final"; title: string; totalCents: number }
  | { k: "job.schedule"; jobId: string; visitId: string; start: string; end: string; techId: string | null; scope: string[] }
  | { k: "company.save"; company: Company; einChanged: boolean }
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
  | { k: "lead.touch"; activityId: string; leadId: string; kind: "call" | "sms" | "email" | "marketplace" | "reply"; at: string; outcome?: CallOutcome }
  | { k: "lead.close"; leadId: string; status: "lost" | "declined"; reason: string; text?: string; activityId: string; from: string }
  | { k: "lead.reopen"; leadId: string; activityId: string; from: string }
  | { k: "lead.assign"; leadId: string; userId: string; activityId: string }
  | { k: "lead.cost"; leadId: string; cents: number }
  | { k: "lead.contactSave"; leadId: string; contact: { id: string; name: string; role: string; phone?: string; email?: string } }
  | { k: "lead.contactRemove"; id: string }
  | { k: "task.save"; task: { id: string; subjectType: string; subjectId: string; title: string; dueAt?: string; assigneeId?: string; doneAt?: string } }
  | { k: "source.save"; source: { id: string; name: string; kind: string; phone?: string; email?: string; customerId?: string; note?: string; active: boolean; position?: number } }
  | {
      k: "customer.create";
      customerId: string; contactId: string; propertyId: string;
      name: string; phone: string; email?: string; sourceId: string; address: string; city: string;
    }
  | { k: "customer.update"; id: string; name?: string; phone?: string; email?: string }
  | { k: "customer.people"; id: string; people: Person[] }
  | { k: "lead.people"; id: string; people: Person[] }
  | { k: "customer.tags"; id: string; tagIds: string[] }
  | { k: "customer.status"; id: string; status: CustomerStatus; reason?: string }
  | { k: "tag.save"; tag: Tag }
  | { k: "property.update"; id: string; address?: string; city?: string }
  | { k: "property.save"; property: Omit<Property, "gateCode"> }
  | { k: "property.gate"; id: string; code: string }
  | { k: "note.add"; id: string; subjectType: string; subjectId: string; body: string; visibility: "team" | "private" }
  | { k: "note.update"; id: string; pinned?: boolean; body?: string; deleted?: boolean }
  | { k: "catalog.save"; item: CatalogItem }
  | { k: "catalog.remove"; id: string }
  | { k: "notice.read"; ids: string[] }
  | { k: "estimate.sign"; id: string; svg: string }
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

/** Errors that will never succeed on retry (permission, constraint). Network errors are retried. */
export class PermanentError extends Error {}

async function run(p: PromiseLike<{ error: { message: string; code?: string } | null }>) {
  const { error } = await p;
  if (!error) return;
  const permanent = error.code ? /^(42|23|22|P0)/.test(error.code) : false;
  if (permanent) throw new PermanentError(error.message);
  throw new Error(error.message);
}

/** Insert by client-made id; a retry after a partial failure does not duplicate rows (ON CONFLICT DO NOTHING). */
function ins(table: string, row: Record<string, unknown>) {
  return supabase.from(table).upsert(row, { onConflict: "id", ignoreDuplicates: true });
}

const JOB_PATH = ["draft", "scheduled", "in_progress", "completed"];
async function advanceJob(jobId: string, to: "scheduled" | "in_progress" | "completed") {
  const { data } = await supabase.from("jobs").select("status").eq("id", jobId).maybeSingle();
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
  const { data } = await supabase.from("lead_sources").select("id, name").eq("company_id", companyId);
  const rows = (data ?? []) as { id: string; name: string }[];
  const name = v.replace(/^src-/, "").toLowerCase();
  return (rows.find((r) => r.name.toLowerCase() === name) ?? rows.find((r) => r.name === "Website") ?? rows[0])?.id ?? "";
}

async function uploadPhoto(companyId: string, fileId: string, uri: string) {
  try {
    const blob = await (await fetch(uri)).blob();
    const key = `${companyId}/${fileId}.jpg`;
    const { error } = await supabase.storage.from("files").upload(key, blob, { contentType: blob.type || "image/jpeg", upsert: true });
    if (error) throw error;
    await supabase.from("files").update({ storage_key: key, upload_status: "uploaded", mime: blob.type || "image/jpeg", size: blob.size }).eq("id", fileId);
  } catch {
    await supabase.from("files").update({ upload_status: "failed" }).eq("id", fileId);
  }
}

export async function applyOp(op: Op, companyId: string, userId: string): Promise<void> {
  const c = companyId;
  switch (op.k) {
    case "visit.step": {
      if (op.to === "en_route" || op.to === "on_site") return run(supabase.from("visits").update({ status: op.to }).eq("id", op.visitId));
      if (op.to === "working") return run(supabase.from("visits").update({ work_started_at: new Date().toISOString() }).eq("id", op.visitId));
      return;
    }
    case "photo.add": {
      await run(
        ins("files", { id: op.id, company_id: c, kind: "photo", visit_id: op.visitId, job_id: op.jobId, stage: op.stage, taken_at: new Date().toISOString() }),
      );
      if (op.uri) await uploadPhoto(c, op.id, op.uri);
      return;
    }
    case "photo.remove":
      return run(supabase.from("files").update({ deleted_at: new Date().toISOString() }).eq("id", op.id));
    case "visit.checklist":
      return run(supabase.from("visits").update({ checklist: op.checklist }).eq("id", op.visitId));
    case "visit.sign":
      return run(supabase.from("visits").update({ signed_at: new Date().toISOString(), signature_svg: op.svg }).eq("id", op.visitId));
    case "visit.pay": {
      await advanceJob(op.jobId, "in_progress");
      await run(
        ins("invoices", {
          id: op.invoiceId, company_id: c, customer_id: op.customerId, job_id: op.jobId, kind: "final", status: "sent",
          subtotal_cents: op.amountCents, total_cents: op.amountCents, due_date: new Date().toISOString().slice(0, 10), sent_at: new Date().toISOString(),
        }),
      );
      await run(
        ins("payments", {
          id: op.paymentId, company_id: c, invoice_id: op.invoiceId, customer_id: op.customerId, visit_id: op.visitId,
          method: op.method, amount_cents: op.amountCents, status: "succeeded", idempotency_key: op.paymentId, received_by: userId,
        }),
      );
      await run(supabase.from("visits").update({ status: "completed" }).eq("id", op.visitId));
      await advanceJob(op.jobId, "completed");
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
      await run(
        ins("jobs", { id: op.jobId, company_id: c, customer_id: op.customerId, property_id: op.propertyId, title: "Estimate visit", type: "inspection", number: "" }),
      );
      const end = new Date(new Date(op.start).getTime() + 45 * 60000).toISOString();
      await run(
        ins("visits", {
          id: op.visitId, company_id: c, job_id: op.jobId, lead_id: op.leadId, kind: "inspection", starts_at: op.start, ends_at: end, scope: op.message ? [op.message] : [],
        }),
      );
      return run(supabase.from("leads").update({ status: "inspection_scheduled", customer_id: op.customerId, property_id: op.propertyId }).eq("id", op.leadId));
    }
    case "lead.visit": {
      await run(
        ins("jobs", { id: op.jobId, company_id: c, customer_id: op.customerId, property_id: op.propertyId, title: "Estimate visit", type: "inspection", number: "" }),
      );
      const end = new Date(new Date(op.start).getTime() + op.durationMin * 60000).toISOString();
      await run(ins("visits", { id: op.visitId, company_id: c, job_id: op.jobId, lead_id: op.leadId, kind: "inspection", starts_at: op.start, ends_at: end, scope: op.scope }));
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
      return run(ins("activities", { id: op.activityId, company_id: c, subject_type: "lead", subject_id: op.leadId, kind: op.kind, direction: "out", at: op.at, meta: op.outcome ? { outcome: op.outcome } : {} }));
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
            due_at: op.task.dueAt ?? null, assignee_id: op.task.assigneeId ?? null, done_at: op.task.doneAt ?? null, done_by: op.task.doneAt ? userId : null,
          },
          { onConflict: "id" },
        ),
      );
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
    case "visit.assign": {
      await run(supabase.from("visit_assignees").delete().eq("visit_id", op.visitId));
      return run(supabase.from("visit_assignees").insert({ company_id: c, visit_id: op.visitId, user_id: op.userId }));
    }
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
      const { count } = await supabase.from("estimate_line_items").select("id", { count: "exact", head: true }).eq("option_id", op.optionId);
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
      await applyOp({ k: "estimate.send", id: op.id, token: op.token }, c, userId);
      const { error } = await supabase.rpc("portal_accept", {
        p_token: op.token, p_option_id: op.optionId, p_addon_ids: op.addonIds, p_signer: op.signer, p_svg: op.svg, p_consent: true,
        p_channel: op.channel, p_job_id: op.jobId, p_visit_id: null, p_invoice_id: op.invoiceId ?? null,
      });
      return run(Promise.resolve({ error }));
    }
    case "job.schedule": {
      await run(ins("visits", { id: op.visitId, company_id: c, job_id: op.jobId, kind: "install", starts_at: op.start, ends_at: op.end, scope: op.scope }));
      if (op.techId) await run(ins("visit_assignees", { company_id: c, visit_id: op.visitId, user_id: op.techId }));
      return advanceJob(op.jobId, "scheduled");
    }
    case "company.save": {
      const { data: stored } = await supabase.from("companies").select("brand, contract_settings, estimate_settings, payment_settings, onboarding_state").eq("id", c).maybeSingle();
      await run(supabase.from("companies").update(companyToDb(op.company, (stored ?? {}) as Record<string, unknown>)).eq("id", c));
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
          subtotal_cents: op.totalCents, total_cents: op.totalCents, due_date: new Date().toISOString().slice(0, 10), sent_at: new Date().toISOString(),
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
      if (op.name !== undefined) await run(supabase.from("customers").update({ display_name: op.name }).eq("id", op.id));
      if (op.phone !== undefined || op.email !== undefined) {
        const patch: Record<string, string | null> = {};
        if (op.phone !== undefined) patch.phone = op.phone || null;
        if (op.email !== undefined) patch.email = op.email || null;
        const { data: primary } = await supabase.from("contacts").select("id").eq("customer_id", op.id).eq("is_primary", true).maybeSingle();
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
      return run(supabase.from("property_secrets").upsert({ property_id: op.id, company_id: c, gate_code: op.code || null }, { onConflict: "property_id" }));
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
      return run(
        supabase.from("catalog_items").upsert(
          {
            id: it.id, company_id: c, kind: it.kind, name: it.name, description: it.description ?? null, unit: it.unit,
            unit_price_cents: it.priceCents, unit_cost_cents: it.costCents ?? null, vendor: it.vendor ?? null,
            vendor_tax_bps: it.vendorTaxBps ?? null, markup_bps: it.markupBps ?? null,
            components: (it.components ?? []).map((x) => ({ item_id: x.itemId, qty: x.qty })), is_placeholder_price: !!it.placeholder,
          },
          { onConflict: "id" },
        ),
      );
    }
    case "catalog.remove":
      return run(supabase.from("catalog_items").update({ deleted_at: new Date().toISOString(), is_active: false }).eq("id", op.id));
    case "notice.read":
      return run(supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", op.ids));
    case "estimate.send": {
      if (op.token) await run(supabase.from("estimates").update({ public_token: op.token }).eq("id", op.id).is("public_token", null));
      const { data } = await supabase.from("estimates").select("current_version_id, status").eq("id", op.id).maybeSingle();
      if (!data || data.status !== "draft") return;
      const now = new Date().toISOString();
      await run(supabase.from("estimate_versions").update({ locked_at: now, sent_at: now }).eq("id", data.current_version_id));
      await run(supabase.from("estimates").update({ status: "sent", sent_version_id: data.current_version_id }).eq("id", op.id));
      const { data: est } = await supabase.from("estimates").select("lead_id").eq("id", op.id).maybeSingle();
      if (est?.lead_id) {
        await run(
          supabase.from("leads").update({ status: "estimate_sent" }).eq("id", est.lead_id).in("status", ["new", "contacted", "qualified", "inspection_scheduled"]),
        );
      }
      return;
    }
    case "estimate.sign": {
      await applyOp({ k: "estimate.send", id: op.id }, c, userId);
      const { data } = await supabase.from("estimates").select("current_version_id, status").eq("id", op.id).maybeSingle();
      if (data?.status === "approved") return;
      await run(
        supabase.from("estimate_approvals").insert({
          company_id: c, estimate_id: op.id, version_id: data?.current_version_id ?? null, signature_svg: op.svg, esign_consent: true, channel: "on_site",
        }),
      );
      return run(supabase.from("estimates").update({ status: "approved" }).eq("id", op.id));
    }
    case "estimate.deposit": {
      const { data } = await supabase.from("estimates").select("current_version_id").eq("id", op.id).maybeSingle();
      // The job may already exist (created when the client approved): reuse it.
      const { data: existing } = await supabase.from("jobs").select("id").eq("estimate_id", op.id).maybeSingle();
      const jobId = (existing?.id as string | undefined) ?? op.jobId;
      await run(
        ins("jobs", {
          id: jobId, company_id: c, customer_id: op.customerId, property_id: op.propertyId, estimate_id: op.id,
          approved_version_id: data?.current_version_id ?? null, title: op.title, contract_total_cents: op.totalCents, number: "",
        }),
      );
      // The job stays "waiting for a date" until the contractor schedules it (job.schedule).
      // A deposit invoice may already exist (created when the client signed): pay it instead of creating another.
      const { data: depInv } = await supabase.from("invoices").select("id").eq("job_id", jobId).eq("kind", "deposit").neq("status", "void").maybeSingle();
      const invoiceId = (depInv?.id as string | undefined) ?? op.invoiceId;
      if (!depInv) await run(
        ins("invoices", {
          id: op.invoiceId, company_id: c, customer_id: op.customerId, job_id: jobId, kind: "deposit", status: "sent",
          subtotal_cents: op.depositCents, total_cents: op.depositCents, due_date: new Date().toISOString().slice(0, 10), sent_at: new Date().toISOString(),
        }),
      );
      return run(
        ins("payments", {
          id: op.paymentId, company_id: c, invoice_id: invoiceId, customer_id: op.customerId, method: op.method,
          amount_cents: op.depositCents, status: "succeeded", idempotency_key: op.paymentId, received_by: userId,
        }),
      );
    }
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
          id: op.id, company_id: c, job_id: op.jobId, vendor: op.vendor, category: expenseCategoryToDb[op.category],
          amount_cents: op.amountCents, idempotency_key: op.id,
        }),
      );
  }
}

/**
 * Draft estimate → database: estimate row, an unlocked version (a new one if the current is already sent),
 * options and line items mirrored from the doc (same ids), costs in the restricted side table.
 * The doc without costs is kept in estimate_versions.calc_inputs for the app and the client page.
 */
async function saveEstimate(op: Extract<Op, { k: "estimate.save" }>, c: string) {
  await run(
    ins("estimates", { id: op.id, company_id: c, customer_id: op.customerId, property_id: op.propertyId, lead_id: op.leadId ?? null, title: op.title, created_via: "manual", number: "" }),
  );
  const { data: est } = await supabase.from("estimates").select("status, current_version_id").eq("id", op.id).maybeSingle();
  if (!est) throw new PermanentError("estimate is not visible");
  if (!["draft", "sent", "viewed"].includes(est.status as string)) return;
  if (est.status !== "draft") await run(supabase.from("estimates").update({ status: "draft" }).eq("id", op.id));
  let versionId = est.current_version_id as string | null;
  if (versionId) {
    const { data: v } = await supabase.from("estimate_versions").select("locked_at, version_no").eq("id", versionId).maybeSingle();
    if (v?.locked_at) {
      const { data: last } = await supabase.from("estimate_versions").select("version_no").eq("estimate_id", op.id).order("version_no", { ascending: false }).limit(1).maybeSingle();
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
        calc_inputs: op.doc, engine_version: ENGINE_VERSION, source: "scratch", intro_text: op.doc.note ?? null,
        totals: { total: op.totalCents, deposit: op.depositCents, marginPct: op.marginPct },
        tax_enabled: taxOn, tax_rate_bps: s.tax.rateBps, tax_mode: "added_on_top", deposit_rule: s.deposit,
        contract_type: s.caHic ? "ca_home_improvement" : "non_hic",
      })
      .eq("id", versionId),
  );
  await run(supabase.from("estimates").update({ title: op.title, current_version_id: versionId }).eq("id", op.id));

  // Replace options and lines of this (unlocked) version.
  const { data: oldOpts } = await supabase.from("estimate_options").select("id").eq("version_id", versionId);
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
        discount_value: s.discount ? (s.discount.kind === "pct" ? Math.round(Number(s.discount.value) * 10000) : s.discount.cents) : null,
      })),
    ),
  );
  const lines = op.doc.options.flatMap((o) =>
    o.lines
      .filter((l) => l.name.trim() !== "" || l.unitPriceCents !== 0)
      .map((l, i) => ({
        id: l.id, company_id: c, option_id: o.id, position: i, line_group: l.group, catalog_item_id: null,
        origin: l.catalogItemId ? "catalog" : "manual", name: l.name.trim() || "—", description: l.description ?? null,
        quantity: Number(l.quantity), unit: l.unit || "ea", unit_price_cents: l.unitPriceCents,
        taxable: taxOn && !!s.tax.groups[l.group], is_optional: !!l.optional,
      })),
  );
  if (lines.length) await run(supabase.from("estimate_line_items").insert(lines));
  const costRows = lines.filter((l) => op.costs[l.id] !== undefined).map((l) => ({ line_item_id: l.id, company_id: c, unit_cost_cents: op.costs[l.id] }));
  if (costRows.length) {
    // Tech without "view costs" cannot write costs; the estimate itself is still saved.
    await supabase.from("estimate_line_costs").upsert(costRows, { onConflict: "line_item_id" });
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
