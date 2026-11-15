/**
 * Client page data (/p/<token>): opened in a phone browser without the app and without signing in.
 * Cloud: public.portal_estimate / public.portal_accept (security definer, anon) — no costs ever leave the server.
 * Demo: the same shape built from the data on this device (the contractor shows the page to the client).
 */
import type { DB, Estimate, EstimateDoc } from "@/data/types";
import { clientDoc } from "@/features/estimateDoc";
import { termsByLangFrom, termsForClient } from "@/features/estimateTerms";
import { docLanguageFor } from "@/data/people";
import { linkOpen } from "@/features/estimateSign";
import { tFor, type DocLang } from "@/i18n/translate";
import { memberName } from "@/features/team";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/config/backend";
import { supabase } from "./client";

export interface PortalData {
  source: "local" | "cloud";
  estimateId?: string;
  number?: string;
  title: string;
  status: "draft" | "sent" | "viewed" | "approved" | "declined" | "expired" | string;
  sentAt?: string;
  doc: EstimateDoc | null;
  company: {
    name: string;
    phone?: string;
    email?: string;
    website?: string;
    address?: string;
    logo?: string;
    color?: string;
    terms?: string;
    /** IANA zone of the company (E2b-2): dates and times on the documents are the company's local ones */
    timezone?: string;
    licenses: { kind: string; number: string; classes: string[] }[];
    contacts: { name: string; title?: string; phone?: string; email?: string }[];
  };
  customer: { name: string; phone?: string; email?: string };
  property: { address: string; city?: string };
  approval: { optionId: string; addonIds: string[]; signerName: string; signedAt: string; signature?: string; totalCents?: number; depositCents?: number; channel?: "on_site" | "portal"; deviceUser?: string } | null;
  depositPaid: boolean;
  /** issued invoices of the job (client pays them on this page) */
  invoices: { id: string; number?: string; title?: string; kind: string; totalCents: number; paidCents: number; dueDate?: string; pendingCents: number }[];
  /** the client's language for this page and its PDF (rule 7); from the server: portal_estimate.doc_language */
  lang: DocLang;
  /** #1304: the «Terms & conditions» the client reads above the signature — the estimate's own text, or (an estimate made
   *  before #1304) the company's default in the client's language; "" — no block. One rule: features/estimateTerms termsForClient */
  terms: string;
  /** «Pay by card» (simulated until Stripe): only for a demo company (portal_estimate.simulated_pay, audit 06.11) */
  simulatedPay: boolean;
  /** 20в: the company's Stripe takes charges — the page shows the real Payment Element (portal_estimate.online_pay) */
  onlinePay: boolean;
  /* ---- wave E2a (docs/specs/07 §2.2) ---- */
  /** YYYY-MM-DD: the link works until this day while unsigned */
  validUntil?: string;
  /** the company's signature: an employee in their own name */
  countersign: { signerName: string; signerTitle?: string; his?: string; signedAt: string; signature?: string } | null;
}

type Raw = {
  number?: string; title?: string; status: string; sent_at?: string; doc?: EstimateDoc | null;
  company?: {
    name?: string; phone?: string; email?: string; website?: string; address?: string; logo?: string; color?: string; terms?: string; terms_by_lang?: unknown; license?: string; timezone?: string;
    licenses?: { kind: string; number: string; classes?: string[] }[];
    contacts?: { name: string; title?: string; phone?: string; email?: string }[];
  };
  customer?: { name?: string; phone?: string | null; email?: string | null }; property?: { address?: string; city?: string; state?: string; zip?: string };
  approval?: { option_id: string; signer_name: string; signed_at: string; signature_svg?: string; selection?: { addon_ids?: string[]; total?: number; deposit?: number }; channel?: string; device_user?: string | null } | null;
  deposit_paid?: boolean;
  invoices?: { id: string; number?: string; title?: string; kind: string; total: number; paid: number; due_date?: string }[];
  doc_language?: string;
  simulated_pay?: boolean;
  online_pay?: boolean;
  /** ACH on its way per invoice id, cents (20в) */
  pending?: Record<string, number>;
  valid_until?: string | null;
  countersign?: { signer_name: string; signer_title?: string | null; his?: string | null; signed_at: string; signature_svg?: string } | null;
};

export function fromRaw(r: Raw): PortalData {
  const p = r.property ?? {};
  const lang: DocLang = r.doc_language === "es" || r.doc_language === "ru" ? r.doc_language : "en";
  // the defaults by language from the server (none from an older one: the old single text is the English one)
  const defaults = { estimate: { validDays: 0, depositBps: null, terms: r.company?.terms, termsByLang: termsByLangFrom(r.company?.terms_by_lang) } };
  return {
    source: "cloud",
    number: r.number,
    title: r.title ?? "",
    status: r.status,
    sentAt: r.sent_at,
    // no option to show (an empty list too): «link not valid», never a page that crashes on mainOption (security-check #415)
    doc: r.doc && Array.isArray(r.doc.options) && r.doc.options.length > 0 ? r.doc : null,
    company: {
      name: r.company?.name ?? "", phone: r.company?.phone, email: r.company?.email, website: r.company?.website,
      address: r.company?.address || undefined, logo: r.company?.logo, color: r.company?.color, terms: r.company?.terms,
      timezone: r.company?.timezone || undefined,
      licenses: (r.company?.licenses ?? []).map((l) => ({ kind: l.kind, number: l.number, classes: l.classes ?? [] })),
      contacts: r.company?.contacts ?? [],
    },
    customer: { name: r.customer?.name ?? "", phone: r.customer?.phone ?? undefined, email: r.customer?.email ?? undefined },
    validUntil: r.valid_until ?? undefined,
    countersign: r.countersign
      ? { signerName: r.countersign.signer_name, signerTitle: r.countersign.signer_title ?? undefined, his: r.countersign.his ?? undefined, signedAt: r.countersign.signed_at, signature: r.countersign.signature_svg }
      : null,
    property: { address: p.address ?? "", city: [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") },
    approval: r.approval
      ? {
          optionId: r.approval.option_id, addonIds: r.approval.selection?.addon_ids ?? [], signerName: r.approval.signer_name,
          signedAt: r.approval.signed_at, signature: r.approval.signature_svg, totalCents: r.approval.selection?.total, depositCents: r.approval.selection?.deposit,
          channel: r.approval.channel === "on_site" ? "on_site" : "portal", deviceUser: r.approval.device_user ?? undefined,
        }
      : null,
    depositPaid: !!r.deposit_paid,
    lang,
    terms: termsForClient(r.doc ?? undefined, defaults, lang, !!r.approval || r.status === "approved" || r.status === "awaiting_countersign"),
    // an older server has no field: keep the button as before; a newer one says false for a real company
    // a closed company (7а-3) has no field either: never the button
    simulatedPay: r.status !== "closed" && r.simulated_pay !== false,
    // an older server has neither: no online payment, nothing on its way
    onlinePay: r.status !== "closed" && r.online_pay === true,
    invoices: (r.invoices ?? []).map((i) => ({
      id: i.id, number: i.number, title: i.title ?? undefined, kind: i.kind, totalCents: Number(i.total), paidCents: Number(i.paid), dueDate: i.due_date,
      pendingCents: Number(r.pending?.[i.id] ?? 0) || 0,
    })),
  };
}

export function localPortal(db: DB, token: string, companyName: string): PortalData | null {
  const e = db.estimates.find((x) => x.token === token);
  // the same rule as the server (founder 05.11): revoked → nothing; past "valid until" (unsigned) → only who to call (E2b)
  if (!e) return null;
  // the same as the server: a declined estimate shows only who declined and who to call
  if (e.status === "declined" && linkOpen(e, new Date())) {
    const p = portalFromEstimate(db, e, companyName);
    return { ...p, doc: null, title: "", customer: { name: "" }, property: { address: "" }, approval: null, countersign: null, invoices: [] };
  }
  if (linkOpen(e, new Date())) return portalFromEstimate(db, e, companyName);
  if (e.linkRevokedAt) return { ...portalFromEstimate(db, e, companyName), status: "revoked", doc: null, approval: null, countersign: null, invoices: [] };
  const p = portalFromEstimate(db, e, companyName);
  return { ...p, status: "expired", doc: null, title: "", customer: { name: "" }, property: { address: "" }, approval: null, countersign: null, invoices: [] };
}

export function portalFromEstimate(db: DB, e: Estimate, companyName: string): PortalData {
  const cust = db.customers.find((c) => c.id === e.customerId);
  const prop = db.properties.find((p) => p.id === e.propertyId);
  return {
    source: "local",
    estimateId: e.id,
    number: e.number,
    title: e.title,
    status: e.status,
    sentAt: e.sentAt,
    doc: e.doc ? clientDoc(e.doc) : null,
    company: companyForPortal(db, companyName),
    customer: { name: cust?.name ?? "", phone: cust?.phone || undefined, email: cust?.email || undefined },
    validUntil: e.validUntil,
    countersign: e.countersign
      ? { signerName: e.countersign.signerName, signerTitle: e.countersign.signerTitle, his: e.countersign.his, signedAt: e.countersign.at, signature: e.countersign.signature }
      : null,
    property: { address: prop?.address ?? "", city: prop?.city },
    approval: e.approval
      ? {
          optionId: e.approval.optionId, addonIds: e.approval.addonIds, signerName: e.approval.signerName, signedAt: e.approval.at, signature: e.approval.signature, totalCents: e.approval.totalCents, depositCents: e.approval.depositCents,
          channel: e.approval.channel,
          // a person who deleted their account (S22): «Deleted user» in the CLIENT's language, never the app's (rule 7)
          deviceUser: memberName(db, e.approval.deviceUserId, tFor(docLanguageFor(db, { customerId: e.customerId, leadId: e.leadId }))),
        }
      : null,
    depositPaid: !!e.depositPaidAt,
    lang: docLanguageFor(db, { customerId: e.customerId, leadId: e.leadId }),
    terms: termsForClient(e.doc, db.company, docLanguageFor(db, { customerId: e.customerId, leadId: e.leadId }), !!e.approval || e.status === "approved" || e.status === "awaiting_countersign"),
    simulatedPay: true, // the demo on this phone
    onlinePay: false, // Stripe needs the server
    invoices: (() => {
      const job = db.jobs.find((x) => x.estimateId === e.id);
      return job
        ? db.invoices
            .filter((x) => x.jobId === job.id)
            .map((x) => ({ id: x.id, number: x.number, title: x.title, kind: x.kind ?? "final", totalCents: x.totalCents, paidCents: x.paidCents, dueDate: x.dueDate, pendingCents: 0 }))
        : [];
    })(),
  };
}

/** 7а-3 (docs/specs/22 §3.5): the server refuses signing and paying for a company its owner closed. */
export const isCompanyClosed = (e: { message?: string } | null | undefined) => !!e?.message && /company closed/i.test(e.message);

export async function fetchPortal(token: string): Promise<PortalData | null> {
  const { data, error } = await supabase.rpc("portal_estimate", { p_token: token });
  if (error) throw new Error(error.message);
  return data ? fromRaw(data as Raw) : null;
}

export async function acceptPortal(token: string, a: { optionId: string; addonIds: string[]; signer: string; svg: string }): Promise<PortalData | null> {
  const { data, error } = await supabase.rpc("portal_accept", {
    p_token: token, p_option_id: a.optionId, p_addon_ids: a.addonIds, p_signer: a.signer, p_svg: a.svg, p_consent: true, p_channel: "portal",
  });
  // closed meanwhile: not a raw English error to the client — the page reloads and says it in their language
  if (isCompanyClosed(error)) return fetchPortal(token);
  if (error) throw new Error(error.message);
  return data ? fromRaw(data as Raw) : null;
}

/** Company header for the client page / PDF from the profile on this device. */
export function companyForPortal(db: DB, fallbackName: string): PortalData["company"] {
  const c = db.company;
  if (!c) return { name: fallbackName, licenses: [], contacts: [] };
  const a = c.address;
  const contacts = c.contacts.filter((x) => x.onDocuments).sort((x, y) => Number(y.isPrimary) - Number(x.isPrimary));
  return {
    name: c.dba || c.name || fallbackName,
    phone: contacts[0]?.phone ?? c.phone,
    email: c.email,
    website: c.website,
    address: a.line1 ? `${a.line1}, ${a.city}, ${a.state} ${a.zip}`.trim() : undefined,
    logo: c.brand.logo,
    color: c.brand.color,
    terms: c.estimate.terms,
    timezone: c.timezone || undefined,
    licenses: c.licenses.filter((l) => l.onDocuments).map((l) => ({ kind: l.kind, number: l.number, classes: l.classes })),
    contacts: contacts.map((x) => ({ name: x.name, title: x.title, phone: x.phone, email: x.email })),
  };
}

const LIC_LABEL: Record<string, string> = { cslb: "CSLB Lic.", city_business: "City Lic.", his: "HIS", other: "Lic." };
/** "CSLB Lic. #1234567 (B, C-10)" — US documents are in English regardless of the app language. */
export const licenseLine = (l: { kind: string; number: string; classes: string[] }) =>
  `${LIC_LABEL[l.kind] ?? "Lic."} #${l.number}${l.classes.length ? ` (${l.classes.join(", ")})` : ""}`;

/** Stripe test mode: the client "pays" the invoice balance by card; no money moves (founder: Stripe later). */
export async function paySimulated(token: string, invoiceId: string): Promise<PortalData | null> {
  const { data, error } = await supabase.rpc("portal_pay_simulated", { p_token: token, p_invoice_id: invoiceId });
  if (isCompanyClosed(error)) return fetchPortal(token);
  if (error) throw new Error(error.message);
  return data ? fromRaw(data as Raw) : null;
}

/** 20в: what stripe-pay answered — what the Payment Element needs, or why there is nothing to pay */
export type OnlinePayStart =
  | { state: "ready"; clientSecret: string; account: string; publishableKey: string; amountCents: number; methods: string[] }
  | { state: "processing" }
  | { state: "error"; error: string; retryAfterS?: number };

/** the edge function stripe-pay (verify_jwt = false: the client has no account; the /p/ token is the key) */
export async function startOnlinePay(token: string, invoiceId: string): Promise<OnlinePayStart> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-pay`, {
      method: "POST",
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ token, invoiceId }),
      signal: ctl.signal,
    });
    const b = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (res.ok && b?.state === "processing") return { state: "processing" };
    if (res.ok && b?.state === "ready" && typeof b.clientSecret === "string" && typeof b.account === "string" && typeof b.publishableKey === "string") {
      return {
        state: "ready", clientSecret: b.clientSecret, account: b.account, publishableKey: b.publishableKey,
        amountCents: Number(b.amountCents), methods: Array.isArray(b.methods) ? b.methods.map(String) : ["card"],
      };
    }
    // too many tries (spec 35 §4д): how long to wait, in seconds — from the body, else from Retry-After
    const wait = Number(b?.retryAfter ?? res.headers.get("retry-after") ?? NaN);
    return {
      state: "error", error: typeof b?.error === "string" ? b.error : res.status === 429 ? "rate_limited" : "failed",
      ...(Number.isFinite(wait) && wait > 0 ? { retryAfterS: Math.ceil(wait) } : {}),
    };
  } catch {
    return { state: "error", error: "network" };
  } finally {
    clearTimeout(timer);
  }
}
