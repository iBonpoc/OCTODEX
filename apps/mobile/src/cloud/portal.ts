/**
 * Client page data (/p/<token>): opened in a phone browser without the app and without signing in.
 * Cloud: public.portal_estimate / public.portal_accept (security definer, anon) — no costs ever leave the server.
 * Demo: the same shape built from the data on this device (the contractor shows the page to the client).
 */
import type { DB, Estimate, EstimateDoc } from "@/data/types";
import { clientDoc } from "@/features/estimateDoc";
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
    licenses: { kind: string; number: string; classes: string[] }[];
    contacts: { name: string; title?: string; phone?: string; email?: string }[];
  };
  customer: { name: string };
  property: { address: string; city?: string };
  approval: { optionId: string; addonIds: string[]; signerName: string; signedAt: string; signature?: string; totalCents?: number; depositCents?: number } | null;
  depositPaid: boolean;
  /** issued invoices of the job (client pays them on this page) */
  invoices: { id: string; number?: string; title?: string; kind: string; totalCents: number; paidCents: number; dueDate?: string }[];
}

type Raw = {
  number?: string; title?: string; status: string; sent_at?: string; doc?: EstimateDoc | null;
  company?: {
    name?: string; phone?: string; email?: string; website?: string; address?: string; logo?: string; color?: string; terms?: string; license?: string;
    licenses?: { kind: string; number: string; classes?: string[] }[];
    contacts?: { name: string; title?: string; phone?: string; email?: string }[];
  };
  customer?: { name?: string }; property?: { address?: string; city?: string; state?: string; zip?: string };
  approval?: { option_id: string; signer_name: string; signed_at: string; signature_svg?: string; selection?: { addon_ids?: string[]; total?: number; deposit?: number } } | null;
  deposit_paid?: boolean;
  invoices?: { id: string; number?: string; title?: string; kind: string; total: number; paid: number; due_date?: string }[];
};

function fromRaw(r: Raw): PortalData {
  const p = r.property ?? {};
  return {
    source: "cloud",
    number: r.number,
    title: r.title ?? "",
    status: r.status,
    sentAt: r.sent_at,
    doc: r.doc && Array.isArray(r.doc.options) ? r.doc : null,
    company: {
      name: r.company?.name ?? "", phone: r.company?.phone, email: r.company?.email, website: r.company?.website,
      address: r.company?.address || undefined, logo: r.company?.logo, color: r.company?.color, terms: r.company?.terms,
      licenses: (r.company?.licenses ?? []).map((l) => ({ kind: l.kind, number: l.number, classes: l.classes ?? [] })),
      contacts: r.company?.contacts ?? [],
    },
    customer: { name: r.customer?.name ?? "" },
    property: { address: p.address ?? "", city: [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") },
    approval: r.approval
      ? {
          optionId: r.approval.option_id, addonIds: r.approval.selection?.addon_ids ?? [], signerName: r.approval.signer_name,
          signedAt: r.approval.signed_at, signature: r.approval.signature_svg, totalCents: r.approval.selection?.total, depositCents: r.approval.selection?.deposit,
        }
      : null,
    depositPaid: !!r.deposit_paid,
    invoices: (r.invoices ?? []).map((i) => ({ id: i.id, number: i.number, title: i.title ?? undefined, kind: i.kind, totalCents: Number(i.total), paidCents: Number(i.paid), dueDate: i.due_date })),
  };
}

export function localPortal(db: DB, token: string, companyName: string): PortalData | null {
  const e = db.estimates.find((x) => x.token === token);
  return e ? portalFromEstimate(db, e, companyName) : null;
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
    customer: { name: cust?.name ?? "" },
    property: { address: prop?.address ?? "", city: prop?.city },
    approval: e.approval
      ? { optionId: e.approval.optionId, addonIds: e.approval.addonIds, signerName: e.approval.signerName, signedAt: e.approval.at, signature: e.approval.signature, totalCents: e.approval.totalCents, depositCents: e.approval.depositCents }
      : null,
    depositPaid: !!e.depositPaidAt,
    invoices: (() => {
      const job = db.jobs.find((x) => x.estimateId === e.id);
      return job
        ? db.invoices
            .filter((x) => x.jobId === job.id)
            .map((x) => ({ id: x.id, number: x.number, title: x.title, kind: x.kind ?? "final", totalCents: x.totalCents, paidCents: x.paidCents, dueDate: x.dueDate }))
        : [];
    })(),
  };
}

export async function fetchPortal(token: string): Promise<PortalData | null> {
  const { data, error } = await supabase.rpc("portal_estimate", { p_token: token });
  if (error) throw new Error(error.message);
  return data ? fromRaw(data as Raw) : null;
}

export async function acceptPortal(token: string, a: { optionId: string; addonIds: string[]; signer: string; svg: string }): Promise<PortalData | null> {
  const { data, error } = await supabase.rpc("portal_accept", {
    p_token: token, p_option_id: a.optionId, p_addon_ids: a.addonIds, p_signer: a.signer, p_svg: a.svg, p_consent: true, p_channel: "portal",
  });
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
  if (error) throw new Error(error.message);
  return data ? fromRaw(data as Raw) : null;
}
