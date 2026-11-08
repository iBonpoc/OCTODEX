/**
 * App hierarchy: every screen knows its section (the tab or ☰ item it lives under) and its parent.
 * "Back" in the header always goes ONE LEVEL UP (Apple HIG / Android "Up"), not to the previous screen in history:
 *   Leads:   Leads → Lead → Estimate → Invoice → Receipt
 *   Clients: Clients → Client → Job → Visit / Schedule
 *   ☰ items (Leads · Jobs · Money · Catalog · Company · Team · Estimates · Settings) are roots like tabs: ☰ instead of «back»
 *   (docs/specs/13 §2.3, 13а §3: there is no «More» tab any more); Catalog → Item, Company → Section.
 * Pure function (no React) — unit-tested in test/hierarchy.test.ts.
 */
import { findJob } from "@/data/jobs";
import type { DB, Role } from "@/data/types";
import type { DictKey } from "@/i18n";
import { SETUP_STEPS, stepTitle, type SetupStep } from "@/features/companySetup";
import { asReport, REPORT_TITLE } from "@/features/reports";
import { roleHome } from "./roles";
import { hasSection, sectionOfHref, sectionOfRoute, type SectionId } from "./sections";

export type Label = { key: DictKey } | { text: string };
export interface NavContext {
  /** the tab or ☰ item the screen lives under (lit in the menu) */
  section?: SectionId;
  kind?: DictKey;
  /** one level up: where the header back button goes and what it says */
  up?: { href: string; label: Label };
}

const K = (key: DictKey): Label => ({ key });
const X = (text: string, fallback: DictKey): Label => (text ? { text } : { key: fallback });
type P = Record<string, string | string[] | undefined>;
/** an unknown report id keeps the section's word */
const reportKind = (id: string): DictKey => { const r = asReport(id); return r ? REPORT_TITLE[r] : "rpt.title"; };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** `appOpen` — signed in and the current Terms accepted: the app's own parents can be offered (the legal texts, review
 *  #274); before that (sign-in, sign-up, the consent gate, an invitation) the screen's own «back» returns there. */
export function navContext(pathname: string, params: P, db: DB, role: Role, opts: { appOpen?: boolean } = {}): NavContext {
  const seg = pathname.split("?")[0]!.split("/").filter(Boolean);
  const [a, b] = seg;
  const id = b ?? "";
  // ☰ items live under the role's home (13а §3); the technician's own leads are a list of his too (13 §2.3)
  const homeRoot = { href: `/${roleHome[role]}`, label: K("nav.home") };
  const leadsRoot = { href: "/leads?tab=leads", label: K("nav.leads") };
  // «Сметы» is a section of its own, one screen for every role (founder 07.11, spec 31 §7а)
  const estList = { href: "/estimates", label: K("nav.estimates") };
  const invList = role === "tech" ? homeRoot : { href: "/invoice", label: K("nav.invoices") };
  const lead = (lid: string) => db.leads.find((l) => l.id === lid);
  const client = (cid: string) => db.customers.find((c) => c.id === cid);
  const job = (jid: string) => findJob(db, jid);
  // the job's own client; an older job without customerId — through its property
  const custOfJob = (jid: string) => {
    const j = job(jid);
    return j?.customerId ?? db.properties.find((p) => p.id === j?.propertyId)?.customerId ?? "";
  };
  const toLead = (lid: string) => ({ href: `/lead/${lid}`, label: X(lead(lid)?.name ?? "", "lead.card") });
  const toClient = (cid: string) => ({ href: `/client/${cid}`, label: X(client(cid)?.name ?? "", "clients.title") });
  const toJob = (jid: string) => ({ href: `/job/${jid}`, label: X(job(jid)?.title ?? "", "jobs.title") });
  const toEstimate = (eid: string) => {
    const e = db.estimates.find((x) => x.id === eid);
    return { href: `/estimate/${eid}`, label: X(e ? `${e.number ?? ""}`.trim() : "", "est.detail") };
  };

  switch (a) {
    case "lead":
      return { section: "leads", kind: id === "new" ? "lead.title" : "lead.card", up: leadsRoot };
    case "estimates":
      return { section: "estimates" };
    case "estimate": {
      // «Моя подпись» lives under «Мои настройки», it is not an estimate with the id «signature» (LOG п.15)
      // «Моя подпись для договоров» is a row of «Профиль и аккаунт» (spec 26): back goes there
      if (id === "signature") return { section: "settings", kind: "est.sig.title", up: { href: "/settings/profile", label: K("fix.settings.profile") } };
      if (id === "new") {
        const lid = one(params.leadId);
        const cid = one(params.customerId);
        const eid = one(params.id);
        const e = eid ? db.estimates.find((x) => x.id === eid) : undefined;
        const up = e ? toEstimate(e.id) : lid ? toLead(lid) : cid ? toClient(cid) : estList;
        return { section: "estimates", kind: "ue.newTitle", up };
      }
      const e = db.estimates.find((x) => x.id === id);
      const up = e?.leadId && lead(e.leadId) ? toLead(e.leadId) : e?.customerId ? toClient(e.customerId) : estList;
      return { section: "estimates", kind: "est.detail", up };
    }
    case "invoice": {
      // «Ещё» → Счета: the list is a root, the end of the chain «Счета › Счёт»
      if (!id) return { section: "invoices" };
      const inv = db.invoices.find((x) => x.id === id);
      const j = inv ? job(inv.jobId) : undefined;
      const up = j?.estimateId ? toEstimate(j.estimateId) : j ? toJob(j.id) : invList;
      return { section: "invoices", kind: "inv.title", up };
    }
    case "receipt": {
      const p = db.payments.find((x) => x.id === id);
      const inv = p ? db.invoices.find((i) => i.id === p.invoiceId) : undefined;
      return {
        section: "invoices",
        kind: "rcpt.title",
        up: inv ? { href: `/invoice/${inv.id}`, label: X(inv.number ?? "", "inv.title") } : invList,
      };
    }
    case "client":
      if (id === "edit") {
        const cid = one(params.id);
        return { section: "clients", kind: cid ? "client.editTitle" : "clients.new", up: cid ? toClient(cid) : { href: "/clients", label: K("tab.clients") } };
      }
      // wave 4b-2 (13 §3.16): the import is under Clients, not a client card
      if (id === "import") return { section: "clients", kind: "client.import.title", up: { href: "/clients", label: K("tab.clients") } };
      // wave 4 (13 §3.3): a row's list of the client (/client/<id>?s=jobs) sits under its client
      if (one(params.s)) return { section: "clients", kind: "client.card", up: toClient(id) };
      return { section: "clients", kind: "client.card", up: { href: "/clients", label: K("tab.clients") } };
    case "property": {
      // C2: a property lives only inside its client
      const cid = db.properties.find((p) => p.id === id)?.customerId;
      // wave 4a-2 (13 §3.3): a row's list of the property (/property/<id>?s=visits) sits under its property
      if (one(params.s) && cid) return { section: "clients", kind: "prop.card", up: { href: `/property/${id}`, label: K("prop.card") } };
      return { section: "clients", kind: "prop.card", up: cid ? toClient(cid) : { href: "/clients", label: K("tab.clients") } };
    }
    case "job":
      if (id === "new") {
        // «Новая работа» (S17): back to the client it was started from, else to Jobs
        const cid = one(params.customerId);
        return { section: cid ? "clients" : "jobs", kind: "job3.newJob", up: cid && client(cid) ? toClient(cid) : { href: "/jobs", label: K("jobs.title") } };
      }
      if (id === "schedule") {
        const jid = one(params.jobId);
        return { section: "clients", kind: "sch.title", up: jid ? toJob(jid) : { href: "/jobs", label: K("jobs.title") } };
      }
      return { section: "clients", kind: "job.card", up: custOfJob(id) ? toClient(custOfJob(id)) : { href: "/jobs", label: K("jobs.title") } };
    case "visit": {
      if (role === "tech") return { section: "home", kind: "visit.title", up: { href: "/visits", label: K("nav.home") } };
      const v = db.visits.find((x) => x.id === id);
      // an inspection has no job: up to the Plan
      return { section: v?.jobId ? "clients" : "plan", kind: "visit.title", up: v?.jobId ? toJob(v.jobId) : { href: "/plan", label: K("nav.plan") } };
    }
    case "catalog":
      return id ? { section: "catalog", kind: "cat.item", up: { href: "/catalog", label: K("cat.title") } } : { section: "catalog" };
    case "suppliers":
      // spec 36: a supplier sits under «Поставщики»
      return id ? { section: "suppliers", kind: "sup.edit", up: { href: "/suppliers", label: K("sup.title") } } : { section: "suppliers" };
    case "company":
      // the last crumb is the section itself («Адрес и часовой пояс», «Расписание»), not «Настройки компании» again
      // checklist templates (docs/specs/08 §7): the list under «Компания», a template under the list
      if (id === "checklists") return { section: "company", kind: "chk2.title", up: { href: "/company", label: K("co.title") } };
      if (id === "checklist") return { section: "company", kind: "chk2.template", up: { href: "/company/checklists", label: K("chk2.title") } };
      // «Приём заявок» (#422): under «Лиды» of the company settings
      if (id === "intake") return { section: "company", kind: "intake.set.title", up: { href: "/company/leads", label: K("co.leads.title") } };
      return id
        ? { section: "company", kind: SETUP_STEPS.includes(id as SetupStep) ? stepTitle(id as SetupStep) : id === "schedule" ? "schs.title" : id === "leads" ? "co.leads.title" : id === "modules" ? "mod.title" : "co.title", up: { href: "/company", label: K("co.title") } }
        : { section: "company" };
    case "reports":
      // «Ещё» → Отчёты: the list is a root, a report goes up to it; its crumb is the report's own title (not «Отчёты» twice)
      return id ? { section: "reports", kind: reportKind(id), up: { href: "/reports", label: K("rpt.title") } } : { section: "reports" };
    case "expense": {
      const jid = one(params.jobId);
      return { section: "money", kind: "exp.title", up: jid ? toJob(jid) : { href: "/money", label: K("nav.expenses") } };
    }
    case "search":
      // «Искать везде» (15-flows §3.2) opens over the home screen
      return { section: "home", kind: "nav.search", up: homeRoot };
    case "notifications":
      // the bell on «Главная» (13 v2 §3.14)
      return { section: "home", kind: "notice.title", up: homeRoot };
    case "figures":
      // a number opened from "Today": back goes to Today, whatever tab the role has
      return { section: "home", up: { href: "/today", label: K("today.title") } };
    case "messages":
      // a conversation sits under «Сообщения» (LOG п.16: after a reload there was no way back); the list is a tab root
      return id ? { section: "messages", kind: "w6.msg.thread", up: { href: "/messages", label: K("nav.messages") } } : {};
    case "settings":
      // «Профиль и аккаунт» (spec 26): opened from the profile card of «Ещё» / the menus — a page of its own
      if (id === "profile") return { section: "settings", kind: "fix.settings.profile" };
      // «Удалить аккаунт» lives in the profile now: back goes to «Профиль и аккаунт» (LOG п.17, spec 26)
      if (id) return { section: "settings", kind: "acct.title", up: { href: "/settings/profile", label: K("fix.settings.profile") } };
      return { section: a };
    case "legal":
      // opened from sign-in, the consent gate or an invitation: back to it, not to «Помощь» (review #274)
      if (opts.appOpen === false) return {};
      // the legal texts are opened from «Помощь и поддержка» (LOG п.17)
      return { section: "help", kind: id === "privacy" ? "legal.privacy.title" : id === "terms" ? "legal.terms.title" : "support.documents", up: { href: "/help", label: K("support.title") } };
    case "jobs":
    case "calls":
    case "tasks":
    case "help":
    case "payments":
    case "money":
    case "team":
      // ☰ roots (13а §3): no «up» — the header has ☰ on the left, like a tab
      return { section: a };
    case "today":
    case "triage":
    case "visits":
      // the role's home is a root; another role's home screen sits under this role's home
      return a === roleHome[role] ? {} : { section: "home", up: homeRoot };
    case "leads":
    case "inbox":
      // the Sales lists: a ☰ root (sales: its home)
      return a === roleHome[role] ? {} : { section: sectionOfRoute(a) };
    default:
      // tabs (plan, messages, clients), the client page /p, auth: no "up"
      return {};
  }
}

/* ---------- Breadcrumbs: "Today › Clients › Client card" (founder, 05.11.2026) ----------
 * The trail is the chain of `up` links, so it can never disagree with the back button.
 * It always starts at the role's home (the first tab: Today / Triage / Visits).
 */
export interface Crumb {
  href: string;
  label: Label;
  /** the role's home screen (drawn with the house icon) */
  home?: boolean;
}

function split(href: string): { path: string; params: P } {
  const [path = "", query = ""] = href.split("?");
  const params: P = {};
  for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  return { path, params };
}
const routeOf = (href: string) => split(href).path.split("/").filter(Boolean)[0] ?? "";

/** Ancestors of the screen, home first, parent last. Empty on a tab root of the role (the big title is where you are). */
export function breadcrumbs(pathname: string, params: P, db: DB, role: Role): Crumb[] {
  const trail: Crumb[] = [];
  let ctx = navContext(pathname, params, db, role);
  const seen = new Set<string>([split(pathname).path]);
  while (ctx.up && !seen.has(ctx.up.href) && trail.length < 8) {
    trail.unshift({ href: ctx.up.href, label: ctx.up.label });
    seen.add(ctx.up.href);
    const next = split(ctx.up.href);
    ctx = navContext(next.path, next.params, db, role);
  }
  if (!trail.length) return trail;
  const home = roleHome[role];
  if (routeOf(trail[0]!.href) === home) trail[0]!.home = true;
  else trail.unshift({ href: `/${home}`, label: K("nav.home"), home: true });
  return trail;
}

/**
 * Which crumbs are shown on a narrow screen: home, "…" (the hidden middle, opened as a menu), and the parent.
 * Up to `max` crumbs fit as they are.
 */
export function collapseCrumbs<C>(trail: C[], max: number): { shown: C[]; hidden: C[]; at: number } {
  if (trail.length <= max) return { shown: trail, hidden: [], at: -1 };
  return { shown: [trail[0]!, trail[trail.length - 1]!], hidden: trail.slice(1, -1), at: 1 };
}

/** Which section (tab or ☰ item) is lit for this screen: its own route, else the root of its «up» chain. */
export function activeSection(pathname: string, params: P, db: DB, role: Role): SectionId | undefined {
  // the role's own home lights «Главная» (sales: its home is the Sales lists on /leads)
  if ((split(pathname).path.split("/").filter(Boolean)[0] ?? "") === roleHome[role]) return "home";
  const sec = sectionOfHref(pathname + (params.tab ? `?tab=${one(params.tab)}` : "")) ?? navContext(pathname, params, db, role).section;
  // a section this role is not shown (the technician on an invoice he takes payment for) lives under his Home
  return sec && !hasSection(role, sec) ? "home" : sec;
}
