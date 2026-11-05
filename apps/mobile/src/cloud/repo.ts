/**
 * Read the company's data from the OCTODEX database and map it to the app's view model (src/data/types.ts).
 * Tables follow docs/04-domain-model.md v0.3.1 (supabase/migrations). RLS decides what each role sees.
 */
import { companyFromDb } from "./companyMap";
import { estimateStatus, jobStatus, leadStatus } from "./statusMap";
import type { CatalogItem, DB, Note, Payment, Estimate, EstimateDoc, Notice, Expense, ExpenseCategory, Invoice, Job, Lead, Source, Task, Activity, Member, Role, Visit, VisitStep } from "@/data/types";
import type { DbRole } from "./auth";
import { supabase } from "./client";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? 0 : Number(v));

export function appRoles(r: DbRole): Role[] {
  if (r === "owner" || r === "admin") return ["director", "dispatcher", "tech"];
  if (r === "office" || r === "sales") return ["dispatcher"];
  return ["tech"];
}
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

export const expenseCategoryToDb: Record<ExpenseCategory, string> = {
  materials: "materials",
  fuel: "fuel",
  dump: "dump_fee",
  tools: "tools",
  other: "other",
};
const expenseCategoryFromDb = (c: string): ExpenseCategory =>
  c === "dump_fee" ? "dump" : (["materials", "fuel", "tools"].includes(c) ? c : "other") as ExpenseCategory;

async function q<T = Row>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export async function loadCompanyDB(companyId: string, userId: string): Promise<DB> {
  const live = <T,>(table: string, cols = "*") => q<T>(supabase.from(table).select(cols).eq("company_id", companyId).is("deleted_at", null));
  const [mems, sources, customers, contacts, properties, jobs, visits, assignees, leads, estimates, versions, options, lines, approvals, invoices, payments, files, expenses, catalogRows, lineCosts, notifications] =
    await Promise.all([
      q<Row>(supabase.from("memberships").select("user_id, role, status, users!memberships_user_id_fkey(full_name, email)").eq("company_id", companyId).eq("status", "active")),
      live<Row>("lead_sources", "id, name, kind, phone, email, customer_id, note, is_active, is_system, position"),
      live<Row>("customers"),
      live<Row>("contacts", "id, customer_id, phone, email, is_primary"),
      live<Row>("properties"),
      live<Row>("jobs"),
      live<Row>("visits"),
      live<Row>("visit_assignees", "visit_id, user_id"),
      live<Row>("leads"),
      live<Row>("estimates"),
      live<Row>("estimate_versions", "id, estimate_id, totals, sent_at, locked_at, calc_inputs"),
      live<Row>("estimate_options", "id, version_id, name"),
      live<Row>("estimate_line_items", "id, option_id, name, quantity, line_total_cents, is_optional, client_visible, position"),
      q<Row>(supabase.from("estimate_approvals").select("estimate_id, option_id, signer_name, channel, selection, signature_svg, signed_at").eq("company_id", companyId)),
      live<Row>("invoices"),
      live<Row>("payments"),
      live<Row>("files", "id, visit_id, stage, storage_key, kind"),
      live<Row>("expenses"),
      live<Row>("catalog_items"),
      // Costs are visible only to owner/admin/office: for others the query returns nothing.
      q<Row>(supabase.from("estimate_line_costs").select("line_item_id, unit_cost_cents").eq("company_id", companyId).is("deleted_at", null)).catch(() => [] as Row[]),
      q<Row>(supabase.from("notifications").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50)).catch(() => [] as Row[]),
    ]);
  const [companyRows, secrets, licenseRows, contactRows, noteRows, leadCosts, leadContacts, taskRows, activityRows] = await Promise.all([
    q<Row>(supabase.from("companies").select("*").eq("id", companyId)),
    // EIN: owner/admin only — others get nothing
    q<Row>(supabase.from("company_secrets").select("ein").eq("company_id", companyId)).catch(() => [] as Row[]),
    live<Row>("company_licenses"),
    live<Row>("company_contacts"),
    live<Row>("notes"),
    // lead cost: owner/admin/office only — others get nothing
    live<Row>("lead_costs", "lead_id, cost_cents").catch(() => [] as Row[]),
    live<Row>("lead_contacts", "id, lead_id, name, role, phone, email").catch(() => [] as Row[]),
    live<Row>("tasks", "id, subject_type, subject_id, title, due_at, assignee_id, done_at").catch(() => [] as Row[]),
    q<Row>(supabase.from("activities").select("id, subject_type, subject_id, kind, body, meta, at, actor_id").eq("company_id", companyId).is("deleted_at", null).order("at", { ascending: false }).limit(2000)).catch(() => [] as Row[]),
  ]);
  const costOfLead = new Map(leadCosts.map((r) => [s(r.lead_id), n(r.cost_cents)]));
  const contactsOfLead = new Map<string, Lead["contacts"]>();
  for (const r of leadContacts) {
    const list = contactsOfLead.get(s(r.lead_id)) ?? [];
    list.push({ id: s(r.id), name: s(r.name), role: s(r.role) as NonNullable<Lead["contacts"]>[number]["role"], phone: (r.phone as string | null) ?? undefined, email: (r.email as string | null) ?? undefined });
    contactsOfLead.set(s(r.lead_id), list);
  }
  const costOf = new Map(lineCosts.map((r) => [s(r.line_item_id), n(r.unit_cost_cents)]));
  const withCosts = (doc: unknown): EstimateDoc | undefined => {
    const d = doc as EstimateDoc | null;
    if (!d || !Array.isArray(d.options) || !d.settings) return undefined;
    return { ...d, options: d.options.map((o) => ({ ...o, lines: o.lines.map((l) => (costOf.has(l.id) ? { ...l, unitCostCents: costOf.get(l.id) } : l)) })) };
  };

  const sourceName = new Map(sources.map((r) => [s(r.id), s(r.name)]));
  const members: Member[] = mems.map((m) => {
    const u = (Array.isArray(m.users) ? m.users[0] : m.users) as Row | null;
    const name = s(u?.full_name) || s(u?.email) || "—";
    return { id: s(m.user_id), name, initials: initials(name), kind: m.role === "subcontractor" ? "sub" : "employee", roles: appRoles(m.role as DbRole) };
  });
  const primaryPhone = new Map<string, string>();
  const primaryEmail = new Map<string, string>();
  for (const c of contacts) if (c.is_primary || !primaryPhone.has(s(c.customer_id))) primaryPhone.set(s(c.customer_id), s(c.phone));
  for (const c of contacts) if (c.email && (c.is_primary || !primaryEmail.has(s(c.customer_id)))) primaryEmail.set(s(c.customer_id), s(c.email));

  const jobById = new Map(jobs.map((j) => [s(j.id), j]));
  const paidVisit = new Map<string, Row>();
  for (const p of payments) if (p.visit_id && ["succeeded", "partially_refunded"].includes(s(p.status))) paidVisit.set(s(p.visit_id), p);
  const assignee = new Map<string, string>();
  for (const a of assignees) if (!assignee.has(s(a.visit_id))) assignee.set(s(a.visit_id), s(a.user_id));

  const visitStep = (v: Row): VisitStep => {
    if (paidVisit.has(s(v.id)) || v.status === "completed") return "paid";
    if (v.signed_at) return "signed";
    if (v.work_started_at) return "working";
    if (v.status === "on_site") return "on_site";
    if (v.status === "en_route") return "en_route";
    return "scheduled";
  };

  const mappedVisits: Visit[] = visits
    .filter((v) => v.status !== "cancelled" && v.job_id)
    .map((v) => {
      const job = jobById.get(s(v.job_id));
      const pay = paidVisit.get(s(v.id));
      const start = s(v.starts_at) || s(v.created_at);
      const dur = v.ends_at && v.starts_at ? Math.round((new Date(s(v.ends_at)).getTime() - new Date(s(v.starts_at)).getTime()) / 60000) : 60;
      return {
        id: s(v.id),
        jobId: s(v.job_id),
        techId: assignee.get(s(v.id)) ?? null,
        start,
        durationMin: dur,
        step: visitStep(v),
        scope: (v.scope as string[] | null) ?? [],
        checklist: (v.checklist as Visit["checklist"] | null) ?? [],
        photos: files
          .filter((f) => f.visit_id === v.id && f.kind === "photo")
          .map((f) => ({ id: s(f.id), kind: f.stage === "after" ? "after" : "before", uri: undefined })),
        amountDueCents: n(job?.contract_total_cents),
        signature: (v.signature_svg as string | null) ?? undefined,
        payment: pay ? { method: s(pay.method) as Visit["payment"] extends infer P ? P extends { method: infer M } ? M : never : never, amountCents: n(pay.amount_cents), at: s(pay.received_at) } : undefined,
      };
    });

  const versionOf = new Map(versions.map((v) => [s(v.id), v]));
  const mappedEstimates: Estimate[] = estimates.map((e) => {
    const ver = versionOf.get(s(e.current_version_id));
    const totals = (ver?.totals ?? {}) as { total?: number; deposit?: number; marginPct?: string | null };
    const opt = options.find((o) => o.version_id === e.current_version_id);
    const appr = approvals.filter((a) => a.estimate_id === e.id).sort((a, b) => s(b.signed_at).localeCompare(s(a.signed_at)))[0];
    const sel = (appr?.selection ?? null) as { addon_ids?: string[]; total?: number; deposit?: number } | null;
    const depositJob = jobs.find((j) => j.estimate_id === e.id);
    const depInv = depositJob ? invoices.find((i) => i.job_id === depositJob.id && i.kind === "deposit") : undefined;
    return {
      id: s(e.id),
      customerId: s(e.customer_id),
      propertyId: s(e.property_id),
      title: s(e.title) || s(e.number),
      leadId: (e.lead_id as string | null) ?? undefined,
      totalCents: sel?.total !== undefined ? n(sel.total) : n(totals.total),
      status: estimateStatus[s(e.status)] ?? "draft",
      sentAt: (ver?.sent_at as string | null) ?? undefined,
      approvedAt: (appr?.signed_at as string | null) ?? undefined,
      depositCents: sel?.deposit !== undefined ? n(sel.deposit) : totals.deposit,
      marginPct: totals.marginPct ?? null,
      signature: (appr?.signature_svg as string | null) ?? undefined,
      doc: withCosts(ver?.calc_inputs),
      token: (e.public_token as string | null) ?? undefined,
      number: s(e.number) || undefined,
      viewedAt: (e.last_viewed_at as string | null) ?? undefined,
      approval:
        appr && appr.option_id
          ? {
              optionId: s(appr.option_id), addonIds: sel?.addon_ids ?? [], signerName: s(appr.signer_name), signature: s(appr.signature_svg),
              at: s(appr.signed_at), channel: appr.channel === "portal" ? "portal" : "on_site", totalCents: n(sel?.total ?? totals.total), depositCents: n(sel?.deposit ?? totals.deposit),
            }
          : undefined,
      depositPaidAt: depInv && n(depInv.paid_cents) > 0 ? s(depInv.updated_at) : undefined,
      lines: lines
        .filter((l) => opt && l.option_id === opt.id && l.client_visible !== false)
        .sort((a, b) => n(a.position) - n(b.position))
        .map((l) => ({ name: s(l.name), qty: s(Number(l.quantity)), totalCents: n(l.line_total_cents), optional: !!l.is_optional })),
    };
  });

  const lastPayment = new Map<string, Row>();
  for (const p of payments) if (p.invoice_id) lastPayment.set(s(p.invoice_id), p);
  const mappedInvoices: Invoice[] = invoices
    .filter((i) => i.status !== "void")
    .map((i) => ({
      id: s(i.id),
      customerId: s(i.customer_id),
      jobId: s(i.job_id),
      totalCents: n(i.total_cents),
      paidCents: n(i.paid_cents),
      dueDate: s(i.due_date) || s(i.created_at),
      paidAt: n(i.paid_cents) >= n(i.total_cents) && lastPayment.get(s(i.id)) ? s(lastPayment.get(s(i.id))?.received_at) : undefined,
      method: (lastPayment.get(s(i.id))?.method as Invoice["method"]) ?? undefined,
      kind: i.kind === "deposit" ? "deposit" : i.kind === "progress" ? "progress" : "final",
      number: s(i.number) || undefined,
      title: (i.title as string | null) ?? undefined,
      sentAt: (i.sent_at as string | null) ?? undefined,
    }));

  const mappedLeads: Lead[] = leads.map((l) => ({
    id: s(l.id),
    name: s(l.contact_name) || "—",
    phone: s(l.phone),
    email: (l.email as string | null) ?? undefined,
    phone2: (l.phone2 as string | null) ?? undefined,
    phone2Label: (l.phone2_label as Lead["phone2Label"] | null) ?? undefined,
    preferredContact: (l.preferred_contact as Lead["preferredContact"] | null) ?? undefined,
    language: (l.language as Lead["language"] | null) ?? undefined,
    city: s(l.address_city) || s(l.address_text).split(",").slice(-1)[0]?.trim() || "",
    address: s(l.address_line1) || s(l.address_text) || undefined,
    state: (l.address_state as string | null) ?? undefined,
    zip: (l.address_zip as string | null) ?? undefined,
    sourceId: s(l.source_id),
    serviceItemId: (l.service_item_id as string | null) ?? undefined,
    service: (l.service_requested as string | null) ?? undefined,
    timeframe: (l.timeframe as Lead["timeframe"] | null) ?? undefined,
    timeframeDate: (l.timeframe_date as string | null) ?? undefined,
    budgetCents: l.budget_cents == null ? undefined : n(l.budget_cents),
    costCents: costOfLead.get(s(l.id)),
    assigneeId: (l.assigned_to as string | null) ?? undefined,
    createdBy: (l.created_by as string | null) ?? undefined,
    firstResponseAt: (l.first_response_at as string | null) ?? undefined,
    contacts: contactsOfLead.get(s(l.id)) ?? [],
    lostReasonText: (l.lost_reason_text as string | null) ?? undefined,
    receivedAt: s(l.received_at),
    message: s(l.message),
    status: leadStatus[s(l.status)] ?? "new",
    customerId: (l.customer_id as string | null) ?? undefined,
    propertyId: (l.property_id as string | null) ?? undefined,
    wonVia: (l.won_via as Lead["wonVia"] | null) ?? undefined,
    lostReason: (l.lost_reason as Lead["lostReason"] | null) ?? undefined,
    lastActivityAt: s(l.updated_at) || undefined,
  }));

  const mappedJobs: Job[] = jobs.map((j) => ({
    id: s(j.id),
    propertyId: s(j.property_id),
    title: s(j.title) || s(j.number),
    status: j.status === "draft" && j.estimate_id ? "unscheduled" : jobStatus[s(j.status)] ?? "scheduled",
    amountCents: n(j.contract_total_cents),
    estimateId: (j.estimate_id as string | null) ?? undefined,
  }));

  const mappedExpenses: Expense[] = expenses.map((x) => ({
    id: s(x.id),
    jobId: (x.job_id as string | null) ?? null,
    vendor: s(x.vendor),
    category: expenseCategoryFromDb(s(x.category)),
    amountCents: n(x.amount_cents),
    at: s(x.created_at),
    memberId: s(x.created_by),
  }));

  return {
    me: userId,
    members,
    sources: sources
      .map((r) => ({
        id: s(r.id), name: s(r.name), kind: (["marketplace", "ads", "person", "own"].includes(s(r.kind)) ? s(r.kind) : "own") as Source["kind"],
        phone: (r.phone as string | null) ?? undefined, email: (r.email as string | null) ?? undefined, customerId: (r.customer_id as string | null) ?? undefined,
        note: (r.note as string | null) ?? undefined, active: r.is_active !== false, system: !!r.is_system, position: n(r.position),
      }))
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name)),
    tasks: taskRows.map((r) => ({
      id: s(r.id), subjectType: s(r.subject_type) as Task["subjectType"], subjectId: s(r.subject_id), title: s(r.title),
      dueAt: (r.due_at as string | null) ?? undefined, assigneeId: (r.assignee_id as string | null) ?? undefined, doneAt: (r.done_at as string | null) ?? undefined,
    })),
    activities: activityRows.map((r) => ({
      id: s(r.id), subjectType: s(r.subject_type) as Activity["subjectType"], subjectId: s(r.subject_id), kind: s(r.kind) as Activity["kind"],
      body: (r.body as string | null) ?? undefined, meta: (r.meta as Record<string, string> | null) ?? undefined, at: s(r.at), actorId: s(r.actor_id),
    })),
    customers: customers.map((c) => ({
      id: s(c.id),
      name: s(c.display_name),
      phone: primaryPhone.get(s(c.id)) ?? "",
      email: primaryEmail.get(s(c.id)) || undefined,
      sourceId: s(c.lead_source_id),
      balanceCents: 0,
      status: c.status === "prospect" ? ("prospect" as const) : ("active" as const),
    })),
    properties: properties.map((p) => ({
      id: s(p.id),
      customerId: s(p.customer_id),
      address: s(p.address_line1),
      city: [s(p.address_city), [s(p.address_state), s(p.address_zip)].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      stories: n(p.stories) || 1,
    })),
    jobs: mappedJobs,
    visits: mappedVisits,
    leads: mappedLeads,
    estimates: mappedEstimates,
    invoices: mappedInvoices,
    expenses: mappedExpenses,
    payments: payments
      .filter((p) => p.invoice_id && ["succeeded", "partially_refunded", "refunded"].includes(s(p.status)))
      .map((p) => ({
        id: s(p.id), invoiceId: s(p.invoice_id), customerId: s(p.customer_id), amountCents: n(p.amount_cents) - n(p.refunded_cents),
        method: (["card", "cash", "check", "zelle"].includes(s(p.method)) ? s(p.method) : "card") as Payment["method"],
        at: s(p.received_at), receiptNumber: (p.receipt_number as string | null) ?? undefined, reference: (p.reference as string | null) ?? undefined,
      }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    company: companyRows[0] ? companyFromDb(companyRows[0], (secrets[0]?.ein as string | null) ?? undefined, licenseRows, contactRows) : null,
    notes: noteRows.map((r) => ({
      id: s(r.id), subjectType: s(r.subject_type) as Note["subjectType"], subjectId: s(r.subject_id), body: s(r.body),
      visibility: r.visibility === "private" ? "private" : "team", pinned: !!r.pinned, authorId: s(r.created_by), at: s(r.created_at),
    })),
    catalog: catalogRows
      .filter((r) => r.is_active !== false)
      .map((r) => ({
        id: s(r.id),
        kind: s(r.kind) as CatalogItem["kind"],
        name: s(r.name),
        description: (r.description as string | null) ?? undefined,
        unit: s(r.unit) || "ea",
        priceCents: n(r.unit_price_cents),
        costCents: r.unit_cost_cents === null || r.unit_cost_cents === undefined ? undefined : n(r.unit_cost_cents),
        vendor: (r.vendor as string | null) ?? undefined,
        vendorTaxBps: r.vendor_tax_bps === null || r.vendor_tax_bps === undefined ? undefined : n(r.vendor_tax_bps),
        markupBps: r.markup_bps === null || r.markup_bps === undefined ? undefined : n(r.markup_bps),
        components: ((r.components as { item_id: string; qty: string }[] | null) ?? []).map((x) => ({ itemId: x.item_id, qty: String(x.qty) })),
        placeholder: !!r.is_placeholder_price,
      })),
    notices: notifications.map((r) => {
      const p = (r.payload ?? {}) as { customer?: string; total?: number; deposit?: number };
      return {
        id: s(r.id), kind: s(r.kind) as Notice["kind"], estimateId: (r.estimate_id as string | null) ?? undefined, jobId: (r.job_id as string | null) ?? undefined, customer: p.customer ?? "",
        totalCents: p.total, depositCents: p.deposit, at: s(r.created_at), read: !!r.read_at,
      };
    }),
  };
}
