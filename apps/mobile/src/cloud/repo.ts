/**
 * Read the company's data from the OCTODEX database and map it to the app's view model (src/data/types.ts).
 * Tables follow docs/04-domain-model.md v0.3.1 (supabase/migrations). RLS decides what each role sees.
 */
import { companyFromDb } from "./companyMap";
import { checklistOf, isMissingTable, itemsByVisit, photoMinsFromDb, templateFromDb, visitSettingsFromDb } from "./checklistMap";
import { companyModulesFromRows, loadModuleData } from "@/modules/registry";
import { customerStatus, estimateStatus, jobDbCancelled, jobStatus, leadStatus, paymentMethodFromDb, paymentShown, visitDbStatus } from "./statusMap";
import { peopleByCustomer } from "@/data/people";
import { PROPERTY_KINDS, PUSH_GROUPS, type PushGroup, type PushPrefs, type CatalogItem, type DB, type Note, type Payment, type Advance, type PendingPayment, type Estimate, type EstimateDoc, type Notice, type Expense, type ExpenseCategory, type Invoice, type Job, type JobType, type JobLineItem, type CalendarEvent, type MemberPrefs, type LocationState, type VisitPoint, type CustomField, type CustomFieldValue, type FileItem, type BillingAddress, type Lead, type Property, type Source, type Task, type Activity, type Member, type Role, type Visit, type VisitStep, type CancelledVisit, type CancelReason } from "@/data/types";
import type { DbRole } from "./auth";
import { supabase } from "./client";
import { legacyForEstimate } from "./legacyTotals";
import { historyFromRow, supplierFromRow } from "@/features/suppliers";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? 0 : Number(v));

export function appRoles(r: DbRole): Role[] {
  if (r === "owner" || r === "admin") return ["director", "dispatcher", "tech"];
  if (r === "office") return ["dispatcher"];
  // sales works leads, estimates and clients but does not plan (the server refuses it: cancel_visit, assign_visit)
  if (r === "sales") return ["sales"];
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

/**
 * A failed read keeps the server's answer: its HTTP status and code go with the error, so the outbox and «без сети»
 * tell a dropped connection, the server's «not now» (5xx, PGRST002…) and a refusal apart (outboxRetry.classify, #244).
 */
async function q<T = Row>(p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null; status?: number }>): Promise<T[]> {
  const { data, error, status } = await p;
  if (error) throw Object.assign(new Error(error.message), { status, code: error.code });
  return (data ?? []) as T[];
}

/** PostgREST answers at most max_rows rows (1000, supabase/config.toml default) per request. */
export const PAGE = 1000;
type Order = { col: string; asc?: boolean };
type Paged = {
  order(col: string, o: { ascending: boolean }): Paged;
  range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
/**
 * Every row of a query, page by page (range of PAGE rows) until a short page, at most `cap` rows.
 * Each page has the same stable order (a unique key), so no row is skipped or read twice between pages.
 * An error on any page fails the whole read, so the callers' fallbacks (old columns) still work.
 */
export async function pages<T = Row>(build: () => unknown, order: Order[], cap = Infinity): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const to = Math.min(from + PAGE, cap) - 1;
    let b = build() as Paged;
    for (const o of order) b = b.order(o.col, { ascending: o.asc ?? true });
    const page = await q<T>(b.range(from, to));
    out.push(...page);
    if (page.length < to - from + 1) break;
  }
  return out;
}
const byId: Order[] = [{ col: "id" }];
/** = app.can_view_costs on the server (migration 20261108130000), for the screens: no row — no costs */
export function costsVisibleFor(m: Row | undefined): boolean {
  if (!m || m.status !== "active") return false;
  if (["owner", "admin", "office"].includes(s(m.role))) return true;
  if (["tech", "subcontractor"].includes(s(m.role))) return false;
  return (m.permissions_override as { view_costs?: unknown } | null)?.view_costs === true;
}
/**
 * A table the server does not have yet (a PR preview on an older database): [] — the caller reads the old place.
 * Any other failure (no network, 5xx) fails the load: «no rows» from a dropped read would look like «no cost», and the
 * next save would write that emptiness back (security check of 19 §9, M2).
 */
const orNoTable = (e: unknown): Row[] => {
  const code = (e as { code?: string } | null)?.code;
  if (code === "PGRST205" || code === "42P01") return [];
  throw e;
};
const key = (...cols: string[]): Order[] => cols.map((col) => ({ col }));

const activityRowsOf = (companyId: string, cols: string) =>
  pages<Row>(() => supabase.from("activities").select(cols).eq("company_id", companyId).is("deleted_at", null), [{ col: "at", asc: false }, { col: "id", asc: false }], 2000);

export async function loadCompanyDB(companyId: string, userId: string): Promise<DB> {
  // every read of the company goes page by page (a company can have more than 1000 clients, contacts, …)
  const live = <T,>(table: string, cols = "*", order = byId) =>
    pages<T>(() => supabase.from(table).select(cols).eq("company_id", companyId).is("deleted_at", null), order);
  const every = <T,>(table: string, cols: string, order = byId) => pages<T>(() => supabase.from(table).select(cols).eq("company_id", companyId), order);
  const [mems, sources, customers, contacts, properties, jobs, visits, assignees, leads, estimates, versions, options, lines, approvals, invoices, payments, files, expenses, catalogRows, lineCosts, notifications, itemCosts, versionCosts] =
    await Promise.all([
      pages<Row>(() => supabase.from("memberships").select("user_id, role, status, can_sign_contracts, title, his_registration_number, permissions_override, users!memberships_user_id_fkey(full_name, email)").eq("company_id", companyId).in("status", ["active", "disabled"]).is("deleted_at", null), byId),
      live<Row>("lead_sources", "id, name, kind, phone, email, customer_id, note, is_active, is_system, position"),
      live<Row>("customers"),
      live<Row>("contacts", "id, customer_id, lead_id, name, role, phone, email, is_primary, preferred_language, created_at"),
      live<Row>("properties"),
      live<Row>("jobs"),
      live<Row>("visits"),
      live<Row>("visit_assignees", "visit_id, user_id, created_at"),
      live<Row>("leads"),
      live<Row>("estimates"),
      live<Row>("estimate_versions", "id, estimate_id, totals, sent_at, locked_at, calc_inputs, tax_enabled, tax_rate_bps, deposit_rule"),
      live<Row>("estimate_options", "id, version_id, name, position, created_at, discount_mode, discount_value"),
      live<Row>("estimate_line_items", "id, option_id, name, quantity, line_total_cents, is_optional, client_visible, position, taxable"),
      every<Row>("estimate_approvals", "estimate_id, option_id, signer_name, channel, selection, signature_svg, signed_at, party, signer_user_id, signer_title, signer_his, method"),
      live<Row>("invoices"),
      live<Row>("payments"),
      // wave П-1: customer_id is new — on a database without the migration read the old columns (preview of a PR)
      // a server before M5d has no measurement_id / element_id; before wave П-1 no customer_id
      live<Row>("files", "id, visit_id, job_id, customer_id, measurement_id, element_id, stage, storage_key, kind, created_at")
        .catch(() => live<Row>("files", "id, visit_id, job_id, customer_id, stage, storage_key, kind, created_at"))
        .catch(() => live<Row>("files", "id, visit_id, job_id, stage, storage_key, kind, created_at")),
      live<Row>("expenses"),
      live<Row>("catalog_items"),
      // Costs are visible only to owner/admin/office: for others the query returns nothing; a failed read fails the load
      // (orNoTable): «no rows» would show the office its estimates without cost
      live<Row>("estimate_line_costs", "line_item_id, unit_cost_cents", key("line_item_id")).catch(orNoTable),
      q<Row>(supabase.from("notifications").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50)).catch(() => [] as Row[]),
      // 19 §9: the price list's costs and the estimates' margins — only who sees costs gets rows (RLS); a server before
      // the migration has no such tables: the old columns (catalog_items, totals.marginPct) are read instead; any other
      // failure fails the load (orNoTable)
      every<Row>("catalog_item_costs", "item_id, unit_cost_cents, vendor_tax_bps, markup_bps", key("item_id")).catch(orNoTable),
      every<Row>("estimate_version_costs", "version_id, margin_pct", key("version_id")).catch(orNoTable),
    ]);
  // E2b-2: employees' saved signatures (RLS: your own, and the owner / admin see the team's)
  // spec 35 §4г: refunds on their way (staff only by RLS; a server before 20а has no table — nothing on its way)
  const refundRows = await every<Row>("refunds", "id, payment_id, amount_cents, status, created_at").catch(() => [] as Row[]);
  const signatureRows = await every<Row>("member_signatures", "id, user_id, svg, name, title, created_at, revoked_at").catch(() => [] as Row[]);
  // wave П-1: the company's job types (no deleted_at, archived ones stay); empty before the migration
  const jobTypeRows = await every<Row>("job_types", "id, seed_key, name, position, archived_at").catch(() => [] as Row[]);
  // wave П-2a: tags and own lines of jobs (RLS: what the job's reader sees); empty before the migration
  const jobTagRows = await every<Row>("job_tags", "job_id, tag_id", key("job_id", "tag_id")).catch(() => [] as Row[]);
  // wave П-2b: events and days off (RLS: the office all, a tech his own and the company's), own fields; empty before the migration
  const [eventRows, fieldRows, valueRows] = await Promise.all([
    live<Row>("calendar_events", "id, kind, user_id, title, description, starts_at, ends_at, all_day").catch(() => [] as Row[]),
    every<Row>("custom_fields", "id, entity, label, type, options, group_name, searchable, position, archived_at").catch(() => [] as Row[]),
    live<Row>("custom_field_values", "id, field_id, entity_id, value").catch(() => [] as Row[]),
  ]);
  // wave 7б-1: my personal settings (RLS: only my own row); no row or no table yet → the defaults
  const prefRows = await pages<Row>(() => supabase.from("member_prefs").select("plan_show_done").eq("company_id", companyId).eq("user_id", userId), key("user_id")).catch(() => [] as Row[]);
  const prefs: MemberPrefs = { planShowDone: prefRows[0]?.plan_show_done === true };
  // step 18 P4b: my push switches (RLS: only my own rows); no rows or no table yet → the defaults
  const pushRows = await pages<Row>(() => supabase.from("push_prefs").select("kind, enabled").eq("company_id", companyId).eq("user_id", userId), key("kind")).catch(() => [] as Row[]);
  const pushPrefs = pushPrefsFromRows(pushRows);
  // spec 33 П15 (C2a): the company's add-on modules; empty before the migration company_modules (C1) or if a read fails
  const moduleRows = await every<Row>("company_modules", "module_key, enabled, trial_ends_at, paid_until, settings, row_version", key("module_key")).catch(() => [] as Row[]);
  const companyModules = companyModulesFromRows(moduleRows);
  // spec 33 П21: each module reads its own tables (the core knows no trade); a failed read keeps the phone's copy
  const moduleData = await loadModuleData(companyModules, { live: (table, cols) => live<Row>(table, cols) });
  // step 14 (migration 20261108140000): the items of visits as rows, the templates. A server before it has no table:
  // the visits keep their old visits.checklist arrays (null), no templates (a tech reads none either: RLS)
  const [chkRows, templateRows] = await Promise.all([
    live<Row>("visit_checklist_items", "id, visit_id, position, label, kind, required, hint, template_id, template_name, done, done_by, done_at, skipped, na_reason, na_text, na_by, na_at, photo_ids, created_by, created_at")
      .then((r) => r as Row[] | null, (e) => {
        if (isMissingTable(e)) return null;
        throw e;
      }),
    live<Row>("checklist_templates").catch((e) => {
      if (isMissingTable(e)) return [] as Row[];
      throw e;
    }),
  ]);
  const chkByVisit = chkRows ? itemsByVisit(chkRows) : null;
  // spec 36 (migration 20261110000000): suppliers (owner / admin / office by RLS; others read none) and the history of
  // costs (only who sees costs; the newest 2000). A server before it has no tables: no suppliers, nothing written
  const [supplierRows, historyRows] = await Promise.all([
    live<Row>("suppliers", "id, name, contact_name, phone, email, account_number, address, payment_terms, terms_note, purchase_tax_bps, notes, is_active")
      .then((r) => r as Row[] | null, (e) => {
        if (isMissingTable(e)) return null;
        throw e;
      }),
    pages<Row>(
      () => supabase.from("catalog_cost_history").select("id, item_id, supplier_id, unit_cost_cents, vendor_tax_bps, source, at").eq("company_id", companyId),
      [{ col: "at", asc: false }, { col: "id", asc: false }],
      2000,
    ).catch((e) => {
      if (isMissingTable(e)) return [] as Row[];
      throw e;
    }),
  ]);
  // wave 7б-2 (migration 20261106210000): the company flag, who shares, the last points of open visits. Each read on its
  // own: before the migration (or if a read fails) the location stays off and the rest of the company still loads.
  const [locAllowed, shareRows, pointRows] = await Promise.all([
    (async () => (await supabase.rpc("company_location_sharing", { p_company_id: companyId })).data === true)().catch(() => false),
    pages<Row>(() => supabase.from("memberships").select("user_id, share_location, location_notice_ack_at").eq("company_id", companyId).is("deleted_at", null), key("user_id")).catch(() => [] as Row[]),
    pages<Row>(
      () => supabase.from("user_locations").select("id, visit_id, user_id, lat, lng, accuracy_m, recorded_at").eq("company_id", companyId).gte("recorded_at", new Date(Date.now() - 12 * 3600_000).toISOString()),
      [{ col: "recorded_at", asc: false }, { col: "id", asc: false }],
      2000,
    ).catch(() => [] as Row[]),
  ]);
  const sharing = new Map(shareRows.map((r) => [s(r.user_id), r.share_location === true]));
  const myShare = shareRows.find((r) => r.user_id === userId);
  const location: LocationState = {
    allowed: locAllowed,
    on: locAllowed && myShare?.share_location === true,
    ...(myShare?.location_notice_ack_at ? { ackAt: s(myShare.location_notice_ack_at) } : {}),
  };
  // newest first: the first row of a person on a visit is their last point (the phone keeps only that one)
  const visitPoints: VisitPoint[] = [];
  const seen = new Set<string>();
  for (const r of pointRows) {
    const k = `${s(r.visit_id)}|${s(r.user_id)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    visitPoints.push({ visitId: s(r.visit_id), userId: s(r.user_id), lat: Number(r.lat), lng: Number(r.lng), accuracyM: r.accuracy_m == null ? undefined : Number(r.accuracy_m), at: s(r.recorded_at) });
  }
  const calendarEvents: CalendarEvent[] = eventRows
    .map((r) => ({
      id: s(r.id), kind: (r.kind === "time_off" ? "time_off" : "event") as CalendarEvent["kind"], userId: (r.user_id as string | null) ?? undefined,
      title: (r.title as string | null) ?? undefined, description: (r.description as string | null) ?? undefined,
      startsAt: s(r.starts_at), endsAt: s(r.ends_at), allDay: !!r.all_day,
    }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const customFields: CustomField[] = fieldRows
    .map((r) => ({
      id: s(r.id), entity: (r.entity === "job" ? "job" : "customer") as CustomField["entity"], label: s(r.label), type: s(r.type) as CustomField["type"],
      options: Array.isArray(r.options) ? (r.options as unknown[]).map(String) : [], group: (r.group_name as string | null) ?? undefined,
      searchable: !!r.searchable, position: n(r.position), archivedAt: (r.archived_at as string | null) ?? undefined,
    }))
    .sort((a, b) => a.entity.localeCompare(b.entity) || a.position - b.position);
  const customFieldValues: CustomFieldValue[] = valueRows.map((r) => ({
    id: s(r.id), fieldId: s(r.field_id), entityId: s(r.entity_id), value: r.value as CustomFieldValue["value"],
  }));
  const jobLineRows = await live<Row>("job_line_items", "id, job_id, position, name, description, catalog_item_id, quantity, unit_price_cents, taxable, line_total_cents").catch(() => [] as Row[]);
  const [companyRows, secrets, licenseRows, contactRows, noteRows, leadCosts, leadContacts, taskRows, activityRows, tagRows, customerTagRows, phoneRows, emailRows, catRows, gateRows] = await Promise.all([
    q<Row>(supabase.from("companies").select("*").eq("id", companyId)),
    // EIN: owner/admin only — others get nothing
    q<Row>(supabase.from("company_secrets").select("ein").eq("company_id", companyId)).catch(() => [] as Row[]),
    live<Row>("company_licenses"),
    live<Row>("company_contacts"),
    live<Row>("notes"),
    // lead cost: owner/admin/office only — others get nothing
    live<Row>("lead_costs", "lead_id, cost_cents", key("lead_id")).catch(() => [] as Row[]),
    live<Row>("lead_contacts", "id, lead_id, name, role, phone, email").catch(() => [] as Row[]),
    // wave П-2b: the time of a task is new — without the migration the old columns are read
    live<Row>("tasks", "id, subject_type, subject_id, title, due_at, assignee_id, done_at, starts_at, ends_at, all_day, description")
      .catch(() => live<Row>("tasks", "id, subject_type, subject_id, title, due_at, assignee_id, done_at"))
      .catch(() => [] as Row[]),
    // wave П-1: contact_id is new — without the migration the feed is read without it, not dropped
    activityRowsOf(companyId, "id, subject_type, subject_id, kind, body, meta, at, actor_id, direction, contact_id")
      .catch(() => activityRowsOf(companyId, "id, subject_type, subject_id, kind, body, meta, at, actor_id, direction"))
      .catch(() => [] as Row[]),
    // clients C1 (tags, several phones / emails per person); empty before the migration is applied
    live<Row>("tags", "id, name, is_active, is_system, position").catch(() => [] as Row[]),
    every<Row>("customer_tags", "customer_id, tag_id", key("customer_id", "tag_id")).catch(() => [] as Row[]),
    live<Row>("contact_phones", "contact_id, number, label, is_primary, position").catch(() => [] as Row[]),
    live<Row>("contact_emails", "contact_id, address, is_primary, position").catch(() => [] as Row[]),
    // directions of the business (docs/specs/11-trade.md): no deleted_at, archived ones stay; empty before the migration
    every<Row>("service_categories", "id, seed_key, name, position, archived_at").catch(() => [] as Row[]),
    // C2: gate codes — RLS gives the office all of them, a tech only on the visit days (app.can_see_gate_code)
    live<Row>("property_secrets", "property_id, gate_code", key("property_id")).catch(() => [] as Row[]),
  ]);
  const people = peopleByCustomer(contacts, phoneRows, emailRows);
  const gateOf = new Map(gateRows.filter((r) => r.gate_code).map((r) => [s(r.property_id), s(r.gate_code)]));
  // L2 part 2: people of leads that have no client yet (migration 20261105120000)
  const peopleOfLead = peopleByCustomer(contacts, phoneRows, emailRows, "lead_id");
  const tagsOfCustomer = new Map<string, string[]>();
  for (const r of customerTagRows) tagsOfCustomer.set(s(r.customer_id), [...(tagsOfCustomer.get(s(r.customer_id)) ?? []), s(r.tag_id)]);
  const costOfLead = new Map(leadCosts.map((r) => [s(r.lead_id), n(r.cost_cents)]));
  const contactsOfLead = new Map<string, Lead["contacts"]>();
  for (const r of leadContacts) {
    const list = contactsOfLead.get(s(r.lead_id)) ?? [];
    list.push({ id: s(r.id), name: s(r.name), role: s(r.role) as NonNullable<Lead["contacts"]>[number]["role"], phone: (r.phone as string | null) ?? undefined, email: (r.email as string | null) ?? undefined });
    contactsOfLead.set(s(r.lead_id), list);
  }
  const costOf = new Map(lineCosts.map((r) => [s(r.line_item_id), n(r.unit_cost_cents)]));
  // the side table's row wins over the item's own (blank since 20261108130000) columns
  const itemCostOf = new Map(itemCosts.map((r) => [s(r.item_id), { unit_cost_cents: r.unit_cost_cents, vendor_tax_bps: r.vendor_tax_bps, markup_bps: r.markup_bps }]));
  const withCosts = (doc: unknown): EstimateDoc | undefined => {
    const d = doc as EstimateDoc | null;
    if (!d || !Array.isArray(d.options) || !d.settings) return undefined;
    return { ...d, options: d.options.map((o) => ({ ...o, lines: o.lines.map((l) => (costOf.has(l.id) ? { ...l, unitCostCents: costOf.get(l.id) } : l)) })) };
  };

  const sourceName = new Map(sources.map((r) => [s(r.id), s(r.name)]));
  // wave 7-2 (S21): pending invitations (RLS shows them to the owner and admins only); a failure here never breaks the load
  const invites = await pages<Row>(() => supabase.from("invitations").select("id, email, name, role, expires_at").eq("company_id", companyId).eq("status", "pending"), byId).catch(() => [] as Row[]);
  // wave 7а-2b (S22): people who deleted their account — their records stay with the company; the name is not given
  // (public.users is anonymised and not shared), screens say «Удалённый пользователь» (features/team.ts memberName).
  // A failure here never breaks the load.
  const gone = await pages<Row>(() => supabase.from("memberships").select("user_id, role").eq("company_id", companyId).eq("status", "deleted"), byId).catch(() => [] as Row[]);
  const all: Member[] = mems.map((m) => {
    const u = (Array.isArray(m.users) ? m.users[0] : m.users) as Row | null;
    const name = s(u?.full_name) || s(u?.email) || "—";
    return {
      id: s(m.user_id), name, initials: initials(name), kind: m.role === "subcontractor" ? "sub" : "employee", roles: appRoles(m.role as DbRole),
      // E2a: signing for the company (docs/specs/07 §2.2 А)
      canSignContracts: m.can_sign_contracts !== false, title: (m.title as string | null) ?? undefined, hisNumber: (m.his_registration_number as string | null) ?? undefined,
      // E2b-2: only the owner gives or takes the right to sign (the app shows owner and admin both as director)
      isOwner: m.role === "owner",
      sharesLocation: sharing.has(s(m.user_id)) ? sharing.get(s(m.user_id)) : undefined,
      // switched off: kept so old records keep the name; `pending` leaves them out of pickers and signing
      ...(m.status === "disabled" ? { disabled: true, pending: true } : {}),
    };
  });
  const members: Member[] = [
    ...all,
    ...deletedMembers(gone, new Set(all.map((m) => m.id))),
    ...invites.map((r): Member => {
      const name = s(r.name) || s(r.email);
      return {
        id: `inv-${s(r.id)}`, invitationId: s(r.id), name, initials: initials(name), kind: r.role === "subcontractor" ? "sub" : "employee",
        roles: appRoles(r.role as DbRole), email: s(r.email), pending: true, expiresAt: s(r.expires_at) || undefined,
      };
    }),
  ];

  const primaryPhone = new Map<string, string>();
  const primaryEmail = new Map<string, string>();
  const clientContacts = contacts.filter((c) => !!c.customer_id);
  for (const c of clientContacts) if (c.is_primary || !primaryPhone.has(s(c.customer_id))) primaryPhone.set(s(c.customer_id), s(c.phone));
  for (const c of clientContacts) if (c.email && (c.is_primary || !primaryEmail.has(s(c.customer_id)))) primaryEmail.set(s(c.customer_id), s(c.email));

  const jobById = new Map(jobs.map((j) => [s(j.id), j]));
  const paidVisit = new Map<string, Row>();
  for (const p of payments) if (p.visit_id && ["succeeded", "partially_refunded"].includes(s(p.status))) paidVisit.set(s(p.visit_id), p);
  // everyone on a visit (wave П3a); the first one is techId for the screens that show one name
  const assignee = new Map<string, string[]>();
  // by the time they were put on: the first one stays the first between loads
  const byTime = [...assignees].sort((a, b) => s(a.created_at).localeCompare(s(b.created_at)) || s(a.user_id).localeCompare(s(b.user_id)));
  for (const a of byTime) assignee.set(s(a.visit_id), [...(assignee.get(s(a.visit_id)) ?? []), s(a.user_id)]);

  const visitStep = (v: Row): VisitStep => {
    // an inspection ends with "done" (no signature, no payment)
    if (v.status === "completed" && v.kind === "inspection" && !paidVisit.has(s(v.id))) return "done";
    if (paidVisit.has(s(v.id)) || v.status === "completed") return "paid";
    if (v.signed_at) return "signed";
    if (v.work_started_at) return "working";
    if (v.status === "on_site") return "on_site";
    if (v.status === "en_route") return "en_route";
    return "scheduled";
  };

  const toVisit = (v: Row): Visit => {
      const job = jobById.get(s(v.job_id));
      const pay = paidVisit.get(s(v.id));
      const start = s(v.starts_at) || s(v.created_at);
      const dur = v.ends_at && v.starts_at ? Math.round((new Date(s(v.ends_at)).getTime() - new Date(s(v.starts_at)).getTime()) / 60000) : 60;
      return {
        id: s(v.id),
        // an inspection has no job (docs/specs/03 §3.1): the visit carries its property and lead
        jobId: (v.job_id as string | null) ?? undefined,
        propertyId: (v.property_id as string | null) ?? undefined,
        leadId: (v.lead_id as string | null) ?? undefined,
        kind: (v.kind as Visit["kind"] | null) ?? undefined,
        customerNotifiedAt: (v.customer_notified_at as string | null) ?? undefined,
        enRouteAt: (v.en_route_at as string | null) ?? undefined,
        allDay: v.all_day === true ? true : undefined,
        note: (v.notes as string | null) || undefined,
        techId: assignee.get(s(v.id))?.[0] ?? null,
        assigneeIds: assignee.get(s(v.id)) ?? [],
        start,
        durationMin: dur,
        step: visitStep(v),
        scope: (v.scope as string[] | null) ?? [],
        checklist: checklistOf(s(v.id), v.checklist, chkByVisit),
        checklistReviewedAt: (v.checklist_reviewed_at as string | null) ?? undefined,
        checklistReviewedBy: (v.checklist_reviewed_by as string | null) ?? undefined,
        photoMins: photoMinsFromDb(v.checklist_min_photos_before, v.checklist_min_photos_after),
        photos: files
          .filter((f) => f.visit_id === v.id && f.kind === "photo")
          .map((f) => ({ id: s(f.id), kind: f.stage === "after" ? "after" : "before", uri: undefined })),
        amountDueCents: n(job?.contract_total_cents),
        signature: (v.signature_svg as string | null) ?? undefined,
        closed: v.status === "completed" || v.status === "no_show" || undefined,
        payment: pay ? { method: paymentMethodFromDb(s(pay.method)), amountCents: n(pay.amount_cents), at: s(pay.received_at) } : undefined,
      };
  };
  const placed = visits.filter((v) => v.job_id || v.property_id);
  // cancelled and no-show ("the client was not home" is a cancel reason) leave the Plan and the day,
  // and stay in the lead's feed with the reason (docs/specs/03 §5.2), as after a local cancel
  const mappedVisits: Visit[] = placed.filter((v) => visitDbStatus[s(v.status)] !== "cancelled").map(toVisit);
  const cancelledVisits: CancelledVisit[] = placed
    .filter((v) => visitDbStatus[s(v.status)] === "cancelled")
    .map((v) => ({
      ...toVisit(v),
      cancelReason: ((v.cancel_reason as CancelReason | null) ?? (v.status === "no_show" ? "no_show" : "other")),
      cancelText: (v.cancel_reason_text as string | null) ?? undefined,
      cancelledAt: s(v.cancelled_at) || s(v.updated_at),
    }));

  const versionOf = new Map(versions.map((v) => [s(v.id), v]));
  const marginOf = new Map(versionCosts.map((r) => [s(r.version_id), (r.margin_pct as string | null) ?? null]));
  const mappedEstimates: Estimate[] = estimates.map((e) => {
    const ver = versionOf.get(s(e.current_version_id));
    const totals = (ver?.totals ?? {}) as { total?: number; deposit?: number; marginPct?: string | null };
    // the first option as the server signs it (sign_estimate_on_site: order by position, created_at)
    const opt = options
      .filter((o) => o.version_id === e.current_version_id)
      .sort((a, b) => n(a.position) - n(b.position) || s(a.created_at).localeCompare(s(b.created_at)))[0];
    const appr = approvals.filter((a) => a.estimate_id === e.id && a.party !== "contractor").sort((a, b) => s(b.signed_at).localeCompare(s(a.signed_at)))[0];
    // the old quick estimate (no document), not signed yet: what the client will sign (legacyForEstimate)
    const legacy = legacyForEstimate(e, { versionOf, options, lines, signed: !!appr });
    // E2a: the company's signature (an employee in their own name)
    const csig = approvals.filter((a) => a.estimate_id === e.id && a.party === "contractor").sort((a, b) => s(b.signed_at).localeCompare(s(a.signed_at)))[0];
    const sel = (appr?.selection ?? null) as { addon_ids?: string[]; total?: number; deposit?: number } | null;
    const depositJob = jobs.find((j) => j.estimate_id === e.id);
    const depInv = depositJob ? invoices.find((i) => i.job_id === depositJob.id && i.kind === "deposit") : undefined;
    return {
      id: s(e.id),
      serviceCategoryId: (e.service_category_id as string | null) ?? undefined,
      customerId: s(e.customer_id),
      propertyId: s(e.property_id),
      title: s(e.title) || s(e.number),
      leadId: (e.lead_id as string | null) ?? undefined,
      totalCents: sel?.total !== undefined ? n(sel.total) : legacy ? legacy.totalCents : n(totals.total),
      status: estimateStatus[s(e.status)] ?? "draft",
      sentAt: (ver?.sent_at as string | null) ?? undefined,
      // approved = both signed: the moment the company signed (a legacy contract signed before E2a: the client's moment)
      approvedAt: e.status === "approved" ? ((csig?.signed_at ?? appr?.signed_at) as string | null) ?? undefined : undefined,
      depositCents: sel?.deposit !== undefined ? n(sel.deposit) : legacy ? legacy.depositCents : totals.deposit,
      marginPct: marginOf.has(s(ver?.id)) ? marginOf.get(s(ver?.id)) ?? null : totals.marginPct ?? null,
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
      countersign: csig
        ? {
            userId: s(csig.signer_user_id), signerName: s(csig.signer_name), signerTitle: (csig.signer_title as string | null) ?? undefined, his: (csig.signer_his as string | null) ?? undefined,
            signature: s(csig.signature_svg), at: s(csig.signed_at), method: csig.method === "saved" ? "saved" : "drawn",
          }
        : undefined,
      validUntil: (e.expires_at as string | null) ?? undefined,
      linkRevokedAt: (e.link_revoked_at as string | null) ?? undefined,
      lines: lines
        .filter((l) => opt && l.option_id === opt.id && l.client_visible !== false)
        .sort((a, b) => n(a.position) - n(b.position))
        .map((l) => ({ name: s(l.name), qty: s(Number(l.quantity)), totalCents: n(l.line_total_cents), optional: !!l.is_optional })),
    };
  });

  const lastPayment = new Map<string, Row>();
  for (const p of payments) if (p.invoice_id && paymentShown(s(p.status))) lastPayment.set(s(p.invoice_id), p);
  const mappedInvoices: Invoice[] = invoices
    // a draft is not sent, so not a debt (wave 8): it stays out like a void one until the app has drafts
    .filter((i) => i.status === "sent")
    .map((i) => ({
      id: s(i.id),
      customerId: s(i.customer_id),
      jobId: s(i.job_id),
      totalCents: n(i.total_cents),
      paidCents: n(i.paid_cents),
      // no due date = due on receipt: from the day it was sent
      dueDate: s(i.due_date) || s(i.sent_at) || s(i.created_at),
      paidAt: n(i.paid_cents) >= n(i.total_cents) && lastPayment.get(s(i.id)) ? s(lastPayment.get(s(i.id))?.received_at) : undefined,
      method: lastPayment.has(s(i.id)) ? paymentMethodFromDb(s(lastPayment.get(s(i.id))?.method)) : undefined,
      kind: i.kind === "deposit" ? "deposit" : i.kind === "progress" ? "progress" : "final",
      number: s(i.number) || undefined,
      title: (i.title as string | null) ?? undefined,
      sentAt: (i.sent_at as string | null) ?? undefined,
      subtotalCents: i.subtotal_cents == null ? undefined : n(i.subtotal_cents),
      taxCents: n(i.tax_cents) || undefined,
      taxMode: (["included_in_price", "added_on_top", "tax_inclusive_display", "exempt"] as const).find((m) => m === i.tax_mode),
    }));

  const mappedLeads: Lead[] = leads.map((l) => ({
    id: s(l.id),
    serviceCategoryId: (l.service_category_id as string | null) ?? undefined,
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
    people: peopleOfLead.get(s(l.id)),
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
    number: (l.number as string | null) ?? undefined,
    interest: (l.interest as Lead["interest"] | null) ?? undefined,
    snoozedUntil: (l.snoozed_until as string | null) ?? undefined,
    snoozeReason: (l.snooze_reason as string | null) ?? undefined,
    callAttempts: l.call_attempts == null ? undefined : n(l.call_attempts),
    lastOutboundAt: (l.last_outbound_at as string | null) ?? undefined,
    lastInboundAt: (l.last_inbound_at as string | null) ?? undefined,
    remindedAt: (l.reminded_at as string | null) ?? undefined,
    askAgainAt: (l.ask_again_at as string | null) ?? undefined,
    archivedAt: (l.archived_at as string | null) ?? undefined,
  }));

  const tagsOfJob = new Map<string, string[]>();
  for (const r of jobTagRows) tagsOfJob.set(s(r.job_id), [...(tagsOfJob.get(s(r.job_id)) ?? []), s(r.tag_id)]);
  const jobLines: JobLineItem[] = jobLineRows
    .map((r) => ({
      id: s(r.id), jobId: s(r.job_id), position: n(r.position), name: s(r.name), description: (r.description as string | null) ?? undefined,
      catalogItemId: (r.catalog_item_id as string | null) ?? undefined, quantity: s(Number(r.quantity)), unitPriceCents: n(r.unit_price_cents),
      taxable: !!r.taxable, totalCents: n(r.line_total_cents),
    }))
    .sort((a, b) => a.jobId.localeCompare(b.jobId) || a.position - b.position);
  const toJob = (j: Row): Job => ({
    id: s(j.id),
    propertyId: s(j.property_id),
    // the number is its own field (wave П-1); until the screens of wave 3 show «Job JOB-0001» themselves, a job without
    // a name still shows its number (decision of the director, #160)
    title: s(j.title) || s(j.number),
    number: s(j.number) || undefined,
    customerId: (j.customer_id as string | null) ?? undefined,
    description: (j.description as string | null) ?? undefined,
    jobTypeId: (j.job_type_id as string | null) ?? undefined,
    tagIds: tagsOfJob.get(s(j.id)) ?? [],
    taxEnabled: j.tax_enabled == null ? undefined : !!j.tax_enabled,
    taxRateBps: j.tax_rate_bps == null ? undefined : n(j.tax_rate_bps),
    status: jobStatus[s(j.status)] ?? "scheduled",
    amountCents: n(j.contract_total_cents),
    estimateId: (j.estimate_id as string | null) ?? undefined,
    serviceCategoryId: (j.service_category_id as string | null) ?? undefined,
  });
  // a cancelled job is not «done»: it leaves the list of jobs and stays apart for invoices and history (wave П-1)
  const mappedJobs: Job[] = jobs.filter((j) => !jobDbCancelled.includes(s(j.status))).map(toJob);
  const cancelledJobs: Job[] = jobs.filter((j) => jobDbCancelled.includes(s(j.status))).map(toJob);
  const jobTypes: JobType[] = jobTypeRows
    .map((r) => ({
      id: s(r.id), seedKey: (r.seed_key as JobType["seedKey"] | null) ?? undefined, name: (r.name as string | null) ?? undefined,
      position: n(r.position), archivedAt: (r.archived_at as string | null) ?? undefined,
    }))
    .sort((a, b) => a.position - b.position);
  const fileItems: FileItem[] = files.map((f) => ({
    id: s(f.id), kind: s(f.kind) as FileItem["kind"], jobId: (f.job_id as string | null) ?? undefined, visitId: (f.visit_id as string | null) ?? undefined,
    customerId: (f.customer_id as string | null) ?? undefined, stage: (f.stage as FileItem["stage"] | null) ?? undefined,
    storageKey: (f.storage_key as string | null) ?? undefined, at: s(f.created_at),
    measurementId: (f.measurement_id as string | null) ?? undefined, elementId: (f.element_id as string | null) ?? undefined,
  }));
  const billingOf = (c: Row): BillingAddress | undefined =>
    c.billing_address_line1
      ? {
          line1: s(c.billing_address_line1), line2: (c.billing_address_line2 as string | null) ?? undefined, unit: (c.billing_address_unit as string | null) ?? undefined,
          city: s(c.billing_address_city), state: (c.billing_address_state as string | null) ?? undefined, zip: (c.billing_address_zip as string | null) ?? undefined,
        }
      : undefined;
  const geoOf = (p: Row): Property["geo"] =>
    p.geo_lat == null || p.geo_lng == null ? undefined : { lat: Number(p.geo_lat), lng: Number(p.geo_lng) };

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
      startsAt: (r.starts_at as string | null) ?? undefined, endsAt: (r.ends_at as string | null) ?? undefined,
      allDay: r.all_day == null ? undefined : !!r.all_day, description: (r.description as string | null) ?? undefined,
    })),
    activities: activityRows.map((r) => ({
      id: s(r.id), subjectType: s(r.subject_type) as Activity["subjectType"], subjectId: s(r.subject_id), kind: s(r.kind) as Activity["kind"],
      body: (r.body as string | null) ?? undefined, meta: (r.meta as Record<string, string> | null) ?? undefined, at: s(r.at), actorId: s(r.actor_id),
      contactId: (r.contact_id as string | null) ?? undefined, direction: r.direction === "in" || r.direction === "out" ? r.direction : undefined,
    })),
    customers: customers.map((c) => {
      const ppl = people.get(s(c.id));
      const main = ppl?.[0];
      return {
        id: s(c.id),
        number: (c.number as string | null) ?? undefined,
        name: s(c.display_name),
        phone: main?.phones.find((p) => p.primary)?.number ?? main?.phones[0]?.number ?? primaryPhone.get(s(c.id)) ?? "",
        email: main?.emails.find((e) => e.primary)?.address ?? (primaryEmail.get(s(c.id)) || undefined),
        sourceId: s(c.lead_source_id),
        balanceCents: 0,
        status: customerStatus[s(c.status)] ?? "active",
        statusReason: (c.do_not_service_reason as string | null) ?? undefined,
        people: ppl,
        tagIds: tagsOfCustomer.get(s(c.id)) ?? [],
        firstName: (c.first_name as string | null) ?? undefined,
        lastName: (c.last_name as string | null) ?? undefined,
        companyName: (c.company_name as string | null) ?? undefined,
        billing: billingOf(c),
        taxExempt: c.tax_exempt == null ? undefined : !!c.tax_exempt,
        taxExemptNote: (c.tax_exempt_note as string | null) ?? undefined,
        // step 17 C3: a server before migration 20261109120000 has no not_duplicate_ids (undefined → none)
        mergedIntoId: (c.merged_into_customer_id as string | null) ?? undefined,
        notDuplicateIds: Array.isArray(c.not_duplicate_ids) && c.not_duplicate_ids.length ? (c.not_duplicate_ids as string[]) : undefined,
      };
    }),
    serviceCategories: catRows
      .map((r) => ({ id: s(r.id), seedKey: (r.seed_key as string | null) ?? undefined, name: (r.name as string | null) ?? undefined, position: n(r.position), archivedAt: (r.archived_at as string | null) ?? undefined }))
      .sort((a, b) => a.position - b.position),
    tags: tagRows
      .map((r) => ({ id: s(r.id), name: s(r.name), active: r.is_active !== false, system: !!r.is_system, position: n(r.position) }))
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    properties: properties.map((p) => ({
      id: s(p.id),
      customerId: s(p.customer_id),
      address: s(p.address_line1),
      city: [s(p.address_city), [s(p.address_state), s(p.address_zip)].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      stories: n(p.stories) || 1,
      unit: (p.address_unit as string | null) ?? undefined,
      place: { city: s(p.address_city), state: (p.address_state as string | null) ?? undefined, zip: (p.address_zip as string | null) ?? undefined },
      label: (p.label as string | null) ?? undefined,
      kind: (PROPERTY_KINDS as readonly string[]).includes(s(p.kind)) ? (s(p.kind) as Property["kind"]) : undefined,
      accessNotes: (p.access_notes as string | null) ?? undefined,
      gateCode: gateOf.get(s(p.id)),
      contactIds: Array.isArray(p.contact_ids) ? (p.contact_ids as string[]) : [],
      geo: geoOf(p),
    })),
    jobs: mappedJobs,
    cancelledJobs,
    jobTypes,
    files: fileItems,
    jobLines,
    calendarEvents,
    prefs,
    pushPrefs,
    location,
    visitPoints,
    customFields,
    customFieldValues,
    visits: mappedVisits,
    cancelledVisits,
    leads: mappedLeads,
    estimates: mappedEstimates,
    invoices: mappedInvoices,
    expenses: mappedExpenses,
    ...paymentsFromRows(payments, refundRows),
    pendingPayments: pendingFromRows(payments),
    company: companyRows[0]
      ? {
          ...companyFromDb(companyRows[0], (secrets[0]?.ein as string | null) ?? undefined, licenseRows, contactRows), modules: companyModules,
          visitSettings: visitSettingsFromDb(companyRows[0].visit_settings), checklistSince: (companyRows[0].checklist_since as string | null) ?? undefined,
        }
      : null,
    checklistTemplates: templateRows.map(templateFromDb),
    // a server before the checklist migration: the store writes the old whole list (rule 16)
    ...(chkByVisit ? {} : { checklistLegacy: true }),
    moduleData,
    suppliers: (supplierRows ?? []).map(supplierFromRow),
    costHistory: historyRows.map(historyFromRow),
    ...(supplierRows ? {} : { suppliersLegacy: true }),
    notes: noteRows.map((r) => ({
      id: s(r.id), subjectType: s(r.subject_type) as Note["subjectType"], subjectId: s(r.subject_id), body: s(r.body),
      visibility: r.visibility === "private" ? "private" : "team", pinned: !!r.pinned, authorId: s(r.created_by), at: s(r.created_at),
    })),
    costsVisible: costsVisibleFor(mems.find((m) => m.user_id === userId)),
    catalog: catalogRows
      .filter((r) => r.is_active !== false)
      .map((r): Row => ({ ...r, ...itemCostOf.get(s(r.id)) }))
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
        // C3 (docs/specs/33 П16): empty before the migration and for items without properties
        ...catalogExtrasFromRow(r),
        // spec 36: absent before the migration and for items without a supplier
        ...(typeof r.supplier_id === "string" ? { supplierId: r.supplier_id } : {}),
        ...(typeof r.supplier_sku === "string" ? { supplierSku: r.supplier_sku } : {}),
      })),
    memberSignatures: signatureRows.map((r) => ({
      id: s(r.id), userId: s(r.user_id), svg: s(r.svg), name: s(r.name), title: (r.title as string | null) ?? undefined,
      createdAt: s(r.created_at), revokedAt: (r.revoked_at as string | null) ?? undefined,
    })),
    notices: notifications.map((r) => {
      const p = (r.payload ?? {}) as { customer?: string; total?: number; deposit?: number };
      return {
        id: s(r.id), kind: s(r.kind) as Notice["kind"], estimateId: (r.estimate_id as string | null) ?? undefined, jobId: (r.job_id as string | null) ?? undefined,
        invoiceId: (r.invoice_id as string | null) ?? undefined, visitId: (r.visit_id as string | null) ?? undefined, customer: p.customer ?? "",
        totalCents: p.total, depositCents: p.deposit, at: s(r.created_at), read: !!r.read_at,
      };
    }),
  };
}

/** memberships «deleted» → people kept only so old records find them (S22): out of every picker (`pending`), off the team */
/** step 18 P4b: push_prefs rows → my switches; an unknown group (a newer server) or a broken row is left out */
export function pushPrefsFromRows(rows: readonly Row[]): PushPrefs {
  const out: PushPrefs = {};
  for (const r of rows) {
    const k = s(r.kind) as PushGroup;
    if (PUSH_GROUPS.includes(k) && typeof r.enabled === "boolean") out[k] = r.enabled;
  }
  return out;
}

export function deletedMembers(rows: readonly Row[], known: ReadonlySet<string> = new Set()): Member[] {
  const seen = new Set(known);
  const out: Member[] = [];
  for (const r of rows) {
    const id = s(r.user_id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: "", initials: "—", kind: r.role === "subcontractor" ? "sub" : "employee", roles: appRoles(r.role as DbRole), pending: true, deleted: true });
  }
  return out;
}

/** catalog_items.attributes / purchase_unit / pack_size → the item's own fields; a broken value is left out */
export function catalogExtrasFromRow(r: Row): Pick<CatalogItem, "attributes" | "purchaseUnit" | "packSize"> {
  const out: Pick<CatalogItem, "attributes" | "purchaseUnit" | "packSize"> = {};
  const a = r.attributes;
  if (a && typeof a === "object" && !Array.isArray(a)) {
    const attrs = Object.fromEntries(Object.entries(a as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
    if (Object.keys(attrs).length) out.attributes = attrs;
  }
  if (typeof r.purchase_unit === "string" && r.purchase_unit.trim()) out.purchaseUnit = r.purchase_unit;
  if (r.pack_size !== null && r.pack_size !== undefined && Number(r.pack_size) > 0) out.packSize = String(Number(r.pack_size));
  return out;
}

/**
 * One module's row as the server has it now (review #374 №1): after a settings conflict the phone reads this module
 * again at once — not the whole company, which waits for the queue. null — no row or no answer.
 */
export async function loadCompanyModule(companyId: string, key: string): Promise<import("@/modules/registry").CompanyModule | null> {
  const { data, error } = await supabase
    .from("company_modules")
    .select("module_key, enabled, trial_ends_at, paid_until, settings, row_version")
    .eq("company_id", companyId)
    .eq("module_key", key)
    .maybeSingle();
  if (error || !data) return null;
  const { companyModulesFromRows } = await import("@/modules/registry");
  return companyModulesFromRows([data as Record<string, unknown>])[key] ?? null;
}

/** the bank may send a refund back «up to 30 days from the post date» (docs.stripe.com/refunds) — as t41 in the database */
export const REFUND_SETTLE_MS = 30 * 24 * 3600 * 1000;

/**
 * Payments and the clients' advances (spec 35 §4г). A fully refunded payment brought nothing: it is not in the list (wave 8);
 * partial — net, with refundedCents. A payment without an invoice (an online payment above the balance) is an advance —
 * its own list, never in sums. refundPendingCents — what refund rows hold back beyond refunded_cents, as
 * app.refund_available: amount − greatest(refunded, Σ pending + succeeded rows).
 */
export function paymentsFromRows(rows: Row[], refundRows: Row[] = [], now: number = Date.now()): { payments: Payment[]; advances: Advance[] } {
  const held = new Map<string, number>();
  // a refund still pending, or one that went less than 30 days ago (the bank may still send it back — t41
  // advance_refund_settling): an advance waits with its apply
  const settling = (r: Row) => s(r.status) === "succeeded" && now - Date.parse(s(r.created_at)) < REFUND_SETTLE_MS;
  const open = new Set(refundRows.filter((r) => s(r.status) === "pending" || settling(r)).map((r) => s(r.payment_id)));
  for (const r of refundRows) {
    if (!["pending", "succeeded"].includes(s(r.status))) continue;
    held.set(s(r.payment_id), (held.get(s(r.payment_id)) ?? 0) + n(r.amount_cents));
  }
  const shown = rows.filter((p) => paymentShown(s(p.status)) && n(p.amount_cents) - n(p.refunded_cents) > 0);
  const base = (p: Row) => {
    const refunded = n(p.refunded_cents);
    const net = n(p.amount_cents) - refunded;
    const pending = Math.min(net, Math.max(0, (held.get(s(p.id)) ?? 0) - refunded));
    return {
      id: s(p.id), customerId: s(p.customer_id), amountCents: net,
      method: paymentMethodFromDb(s(p.method)),
      at: s(p.received_at), receiptNumber: (p.receipt_number as string | null) ?? undefined, reference: (p.reference as string | null) ?? undefined,
      receivedBy: (p.received_by as string | null) ?? undefined, refundedCents: refunded || undefined,
      needsReview: p.needs_review === true || undefined,
      feeCents: n(p.fee_cents) > 0 ? n(p.fee_cents) : undefined,
      refundPendingCents: pending > 0 ? pending : undefined,
      refundOpen: open.has(s(p.id)) || undefined,
    };
  };
  const newest = <T extends { at: string }>(a: T, b: T) => b.at.localeCompare(a.at);
  return {
    payments: shown.filter((p) => p.invoice_id).map((p) => ({ ...base(p), invoiceId: s(p.invoice_id) })).sort(newest),
    // an advance is Stripe's money kept without an invoice (key «stripe:pi_…»); a payment recorded by hand without an
    // invoice is not one (security review of spec 35 §4г) — it stays out, as before
    advances: shown.filter((p) => !p.invoice_id && s(p.idempotency_key).startsWith("stripe:")).map((p) => ({ ...base(p), invoiceId: null })).sort(newest),
  };
}

/** ACH on its way (20в): payments.status = pending with an invoice — shown as «processing», never counted (statusMap.paymentShown) */
export function pendingFromRows(rows: Row[]): PendingPayment[] {
  return rows
    .filter((p) => p.invoice_id && s(p.status) === "pending" && n(p.amount_cents) > 0)
    .map((p) => ({ id: s(p.id), invoiceId: s(p.invoice_id), amountCents: n(p.amount_cents), method: paymentMethodFromDb(s(p.method)), at: s(p.received_at) }))
    .sort((a, b) => b.at.localeCompare(a.at));
}
