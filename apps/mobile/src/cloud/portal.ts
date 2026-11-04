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
  company: { name: string; phone?: string; email?: string; license?: string };
  customer: { name: string };
  property: { address: string; city?: string };
  approval: { optionId: string; addonIds: string[]; signerName: string; signedAt: string; signature?: string; totalCents?: number; depositCents?: number } | null;
  depositPaid: boolean;
}

type Raw = {
  number?: string; title?: string; status: string; sent_at?: string; doc?: EstimateDoc | null;
  company?: { name?: string; phone?: string; email?: string; license?: string };
  customer?: { name?: string }; property?: { address?: string; city?: string; state?: string; zip?: string };
  approval?: { option_id: string; signer_name: string; signed_at: string; signature_svg?: string; selection?: { addon_ids?: string[]; total?: number; deposit?: number } } | null;
  deposit_paid?: boolean;
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
    company: { name: r.company?.name ?? "", phone: r.company?.phone, email: r.company?.email, license: r.company?.license },
    customer: { name: r.customer?.name ?? "" },
    property: { address: p.address ?? "", city: [p.city, [p.state, p.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") },
    approval: r.approval
      ? {
          optionId: r.approval.option_id, addonIds: r.approval.selection?.addon_ids ?? [], signerName: r.approval.signer_name,
          signedAt: r.approval.signed_at, signature: r.approval.signature_svg, totalCents: r.approval.selection?.total, depositCents: r.approval.selection?.deposit,
        }
      : null,
    depositPaid: !!r.deposit_paid,
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
    company: { name: companyName },
    customer: { name: cust?.name ?? "" },
    property: { address: prop?.address ?? "", city: prop?.city },
    approval: e.approval
      ? { optionId: e.approval.optionId, addonIds: e.approval.addonIds, signerName: e.approval.signerName, signedAt: e.approval.at, signature: e.approval.signature, totalCents: e.approval.totalCents, depositCents: e.approval.depositCents }
      : null,
    depositPaid: !!e.depositPaidAt,
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
