/**
 * Outbox operations: every change made on the phone is applied locally at once and recorded here,
 * then sent to the OCTODEX database when online (offline-first, docs/06-architecture, ADR-003).
 * Ops are idempotent where money is involved (payments carry idempotency_key = payment id).
 */
import type { ExpenseCategory, PaymentMethod, VisitStep } from "@/data/types";
import { supabase } from "./client";
import { expenseCategoryToDb } from "./repo";

export type Op =
  | { k: "visit.step"; visitId: string; to: VisitStep }
  | { k: "photo.add"; id: string; visitId: string; jobId: string; stage: "before" | "after"; uri?: string }
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
      source: string;
      address: string;
      city: string;
      message: string;
      start: string;
    }
  | { k: "lead.add"; id: string; name: string; phone: string; city: string; address?: string; source: string; message: string }
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
  | { k: "estimate.send"; id: string }
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

async function sourceId(companyId: string, name: string): Promise<string> {
  const { data } = await supabase.from("lead_sources").select("id, name").eq("company_id", companyId);
  const rows = (data ?? []) as { id: string; name: string }[];
  return (rows.find((r) => r.name === name) ?? rows.find((r) => r.name === "Website") ?? rows[0])?.id ?? "";
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
      return run(
        supabase.from("leads").update({ status: "contacted", first_response_at: new Date().toISOString(), first_response_kind: "sms" }).eq("id", op.leadId).eq("status", "new"),
      );
    case "lead.book": {
      const src = await sourceId(c, op.source);
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
    case "lead.add": {
      const src = await sourceId(c, op.source);
      return run(
        ins("leads", {
          id: op.id, company_id: c, source_id: src, contact_name: op.name, phone: op.phone,
          address_text: [op.address, op.city].filter(Boolean).join(", "), message: op.message, cost_origin: "manual",
        }),
      );
    }
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
    case "estimate.send": {
      const { data } = await supabase.from("estimates").select("current_version_id, status").eq("id", op.id).maybeSingle();
      if (!data || data.status !== "draft") return;
      const now = new Date().toISOString();
      await run(supabase.from("estimate_versions").update({ locked_at: now, sent_at: now }).eq("id", data.current_version_id));
      return run(supabase.from("estimates").update({ status: "sent", sent_version_id: data.current_version_id }).eq("id", op.id));
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
      await run(
        ins("jobs", {
          id: op.jobId, company_id: c, customer_id: op.customerId, property_id: op.propertyId, estimate_id: op.id,
          approved_version_id: data?.current_version_id ?? null, title: op.title, contract_total_cents: op.totalCents, number: "",
        }),
      );
      await advanceJob(op.jobId, "scheduled");
      await run(
        ins("invoices", {
          id: op.invoiceId, company_id: c, customer_id: op.customerId, job_id: op.jobId, kind: "deposit", status: "sent",
          subtotal_cents: op.depositCents, total_cents: op.depositCents, due_date: new Date().toISOString().slice(0, 10), sent_at: new Date().toISOString(),
        }),
      );
      return run(
        ins("payments", {
          id: op.paymentId, company_id: c, invoice_id: op.invoiceId, customer_id: op.customerId, method: op.method,
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
