/**
 * App hierarchy: every screen knows its section (the tab it lives under) and its parent.
 * "Back" in the header always goes ONE LEVEL UP (Apple HIG / Android "Up"), not to the previous screen in history:
 *   Sales:   Leads → Lead → Estimate → Invoice → Receipt
 *   Clients: Clients → Client → Job → Visit / Schedule
 *   More:    More → Jobs · Money · Catalog → Item · Company → Section · Team · Estimates
 * Pure function (no React) — unit-tested in test/hierarchy.test.ts.
 */
import type { DB, Role } from "@/data/types";
import type { DictKey } from "@/i18n";

export type Label = { key: DictKey } | { text: string };
export interface NavContext {
  /** tab section shown above the title ("Sales · Lead") */
  section?: DictKey;
  kind?: DictKey;
  /** one level up: where the header back button goes and what it says */
  up?: { href: string; label: Label };
}

const K = (key: DictKey): Label => ({ key });
const X = (text: string, fallback: DictKey): Label => (text ? { text } : { key: fallback });
type P = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function navContext(pathname: string, params: P, db: DB, role: Role): NavContext {
  const seg = pathname.split("?")[0]!.split("/").filter(Boolean);
  const [a, b] = seg;
  const id = b ?? "";
  const salesRoot = { href: "/inbox?tab=leads", label: K("sales.leads") };
  const moreRoot = { href: "/more", label: K("tab.more") };
  const lead = (lid: string) => db.leads.find((l) => l.id === lid);
  const client = (cid: string) => db.customers.find((c) => c.id === cid);
  const job = (jid: string) => db.jobs.find((j) => j.id === jid);
  const custOfJob = (jid: string) => db.properties.find((p) => p.id === job(jid)?.propertyId)?.customerId ?? "";
  const toLead = (lid: string) => ({ href: `/lead/${lid}`, label: X(lead(lid)?.name ?? "", "lead.card") });
  const toClient = (cid: string) => ({ href: `/client/${cid}`, label: X(client(cid)?.name ?? "", "clients.title") });
  const toJob = (jid: string) => ({ href: `/job/${jid}`, label: X(job(jid)?.title ?? "", "jobs.title") });
  const toEstimate = (eid: string) => {
    const e = db.estimates.find((x) => x.id === eid);
    return { href: `/estimate/${eid}`, label: X(e ? `${e.number ?? ""}`.trim() : "", "est.detail") };
  };

  switch (a) {
    case "lead":
      return { section: "tab.sales", kind: id === "new" ? "lead.title" : "lead.card", up: salesRoot };
    case "estimates":
      return { section: "tab.sales", up: { href: "/inbox?tab=estimates", label: K("tab.sales") } };
    case "estimate": {
      if (id === "new") {
        const lid = one(params.leadId);
        const cid = one(params.customerId);
        const eid = one(params.id);
        const e = eid ? db.estimates.find((x) => x.id === eid) : undefined;
        const up = e ? toEstimate(e.id) : lid ? toLead(lid) : cid ? toClient(cid) : { href: "/inbox?tab=estimates", label: K("sales.estimates") };
        return { section: "tab.sales", kind: "ue.newTitle", up };
      }
      const e = db.estimates.find((x) => x.id === id);
      const up = e?.leadId && lead(e.leadId) ? toLead(e.leadId) : e?.customerId ? toClient(e.customerId) : { href: "/inbox?tab=estimates", label: K("sales.estimates") };
      return { section: "tab.sales", kind: "est.detail", up };
    }
    case "invoice": {
      const inv = db.invoices.find((x) => x.id === id);
      const j = inv ? job(inv.jobId) : undefined;
      const up = j?.estimateId ? toEstimate(j.estimateId) : j ? toJob(j.id) : { href: "/inbox?tab=invoices", label: K("sales.invoices") };
      return { section: "tab.sales", kind: "inv.title", up };
    }
    case "receipt": {
      const p = db.payments.find((x) => x.id === id);
      const inv = p ? db.invoices.find((i) => i.id === p.invoiceId) : undefined;
      return {
        section: "tab.sales",
        kind: "rcpt.title",
        up: inv ? { href: `/invoice/${inv.id}`, label: X(inv.number ?? "", "inv.title") } : { href: "/inbox?tab=invoices", label: K("sales.invoices") },
      };
    }
    case "client":
      if (id === "edit") {
        const cid = one(params.id);
        return { section: "tab.clients", kind: cid ? "client.editTitle" : "clients.new", up: cid ? toClient(cid) : { href: "/clients", label: K("tab.clients") } };
      }
      return { section: "tab.clients", kind: "client.card", up: { href: "/clients", label: K("tab.clients") } };
    case "job":
      if (id === "schedule") {
        const jid = one(params.jobId);
        return { section: "tab.clients", kind: "sch.title", up: jid ? toJob(jid) : { href: "/jobs", label: K("jobs.title") } };
      }
      return { section: "tab.clients", kind: "job.card", up: custOfJob(id) ? toClient(custOfJob(id)) : { href: "/jobs", label: K("jobs.title") } };
    case "visit": {
      if (role === "tech") return { section: "tab.visits", kind: "visit.title", up: { href: "/visits", label: K("tab.visits") } };
      const v = db.visits.find((x) => x.id === id);
      return { section: "tab.plan", kind: "visit.title", up: v ? toJob(v.jobId) : { href: "/plan", label: K("tab.plan") } };
    }
    case "catalog":
      return id ? { section: "tab.more", kind: "cat.item", up: { href: "/catalog", label: K("cat.title") } } : { section: "tab.more", up: moreRoot };
    case "company":
      return id ? { section: "tab.more", kind: "co.title", up: { href: "/company", label: K("co.title") } } : { section: "tab.more", up: moreRoot };
    case "expense": {
      const jid = one(params.jobId);
      return { section: "tab.more", kind: "exp.title", up: jid ? toJob(jid) : { href: "/money", label: K("money.title") } };
    }
    case "jobs":
    case "money":
    case "team":
      return { section: "tab.more", up: moreRoot };
    default:
      // tab roots (today, inbox, clients, plan, visits, triage, more), client page /p, auth: no "up"
      return {};
  }
}
