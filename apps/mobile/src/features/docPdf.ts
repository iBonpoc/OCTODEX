/**
 * Invoice and receipt as printable HTML (→ PDF via saveEstimatePdf). Company header from the profile.
 * US documents: amounts in $, en-US dates (via the passed formatters). Colors/sizes from the `print` tokens.
 */
import { print as P } from "@octo/design-tokens";
import { contractStatement } from "@octo/estimating-engine";
import { licenseLine, type PortalData } from "@/cloud/portal";
import type { DB, Invoice, Payment } from "@/data/types";
import type { DictKey } from "@/i18n";

type Fmt = { t: (k: DictKey, params?: Record<string, string | number>) => string; money: (c: number) => string; day: (iso: string) => string };
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function page(title: string, company: PortalData["company"], body: string): string {
  const c = company;
  const lines = [
    c.address,
    ...c.contacts.map((x) => [[x.name, x.title].filter(Boolean).join(", "), x.phone].filter(Boolean).join(" · ")),
    c.contacts.length ? undefined : c.phone,
    c.email,
    c.website,
    ...c.licenses.map(licenseLine),
  ].filter(Boolean) as string[];
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { margin: ${P.pagePadMm}mm; }
body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: ${P.ink}; background: ${P.paper}; font-size: ${P.fontPt.body}pt; margin: 0; }
h1 { font-size: ${P.fontPt.title}pt; margin: 0 0 4pt; }
h2 { font-size: ${P.fontPt.heading}pt; margin: 14pt 0 4pt; }
.mut { color: ${P.mut}; font-size: ${P.fontPt.small}pt; }
.head { display: flex; justify-content: space-between; gap: 12pt; border-bottom: ${c.color ? `2px solid ${esc(c.color)}` : `1px solid ${P.rule}`}; padding-bottom: 8pt; }
table { width: 100%; border-collapse: collapse; }
td, th { padding: 4pt 0; border-bottom: 1px solid ${P.rule}; text-align: left; }
th { color: ${P.mut}; font-weight: 500; font-size: ${P.fontPt.small}pt; }
.r { text-align: right; white-space: nowrap; }
.tot td { font-weight: 700; font-size: ${P.fontPt.heading}pt; }
.ok { color: ${P.okText}; font-weight: 600; }
</style></head><body>
<div class="head"><div style="display:flex;gap:10pt;align-items:flex-start">${
    c.logo && c.logo.startsWith("data:image/") ? `<img src="${esc(c.logo)}" style="width:48pt;height:48pt;object-fit:contain" alt="">` : ""
  }<div><h1>${esc(c.name || "OCTODEX")}</h1>${lines.map((l) => `<div class="mut">${esc(l)}</div>`).join("")}</div></div>
<div style="text-align:right"><h1>${esc(title)}</h1></div></div>
${body}
</body></html>`;
}

const kindKey = (i: Invoice): DictKey => (i.kind === "deposit" ? "inv.kind.deposit" : i.kind === "progress" ? "inv.kind.progress" : "inv.kind.final");

export function invoiceHtml(db: DB, inv: Invoice, company: PortalData["company"], f: Fmt): string {
  const { t, money, day } = f;
  const cust = db.customers.find((c) => c.id === inv.customerId);
  const job = db.jobs.find((j) => j.id === inv.jobId);
  const prop = db.properties.find((p) => p.id === job?.propertyId);
  const pays = db.payments.filter((p) => p.invoiceId === inv.id);
  const jobInvoices = db.invoices.filter((i) => i.jobId === inv.jobId);
  const st = job ? contractStatement(job.amountCents, jobInvoices) : null;
  const prior = jobInvoices.filter((i) => i.id !== inv.id && (i.sentAt ?? "") <= (inv.sentAt ?? "~"));
  const body = `
<table style="margin-top:10pt"><tr><td style="border:0;vertical-align:top"><b>${esc(t("portal.for"))}:</b> ${esc(cust?.name ?? "")}<br>${esc(
    [prop?.address, prop?.city].filter(Boolean).join(", "),
  )}</td><td class="r" style="border:0;vertical-align:top"><b>${esc(inv.number ?? "")}</b><br>${esc(t("inv.date"))}: ${day(inv.sentAt ?? inv.dueDate)}<br>${esc(
    t("inv.due"),
  )}: ${day(inv.dueDate)}</td></tr></table>
<h2>${esc(inv.title || t(kindKey(inv)))}</h2>
<table>
${job && st && inv.kind !== "deposit" ? `<tr><td>${esc(t("inv.contract"))}: ${esc(job.title)}</td><td class="r">${money(st.contract)}</td></tr>` : ""}
${inv.kind === "final" ? prior.map((i) => `<tr><td class="mut">${esc(t("inv.less"))} ${esc(i.number ?? "")} ${esc(i.title ?? "")}</td><td class="r mut">−${money(i.totalCents)}</td></tr>`).join("") : ""}
<tr class="tot"><td>${esc(t("inv.amount"))}</td><td class="r">${money(inv.totalCents)}</td></tr>
${pays.map((p) => `<tr><td class="mut">${esc(t("inv.paymentOn", { date: day(p.at) }))} · ${esc(t(`pay.${p.method}` as DictKey))}${p.receiptNumber ? ` · ${esc(p.receiptNumber)}` : ""}</td><td class="r mut">−${money(p.amountCents)}</td></tr>`).join("")}
<tr class="tot"><td>${esc(t("inv.balance"))}</td><td class="r">${money(Math.max(0, inv.totalCents - inv.paidCents))}</td></tr>
</table>
${inv.paidCents >= inv.totalCents ? `<p class="ok">✓ ${esc(t("inv.paidInFull"))}</p>` : ""}
${payInstructions(db, f)}`;
  return page(`${t("inv.title")} ${inv.number ?? ""}`.trim(), company, body);
}

function payInstructions(db: DB, f: Fmt): string {
  const p = db.company?.payment;
  const lines = [p?.zelle ? `Zelle: ${p.zelle}` : "", p?.checkPayableTo ? `${f.t("inv.checkTo")} ${p.checkPayableTo}` : ""].filter(Boolean);
  return lines.length ? `<p class="mut">${lines.map(esc).join("<br>")}</p>` : "";
}

export function receiptHtml(db: DB, p: Payment, company: PortalData["company"], f: Fmt): string {
  const { t, money, day } = f;
  const inv = db.invoices.find((i) => i.id === p.invoiceId);
  const cust = db.customers.find((c) => c.id === p.customerId);
  const balance = inv ? Math.max(0, inv.totalCents - inv.paidCents) : 0;
  const body = `
<table style="margin-top:10pt">
<tr><td>${esc(t("rcpt.receivedFrom"))}</td><td class="r">${esc(cust?.name ?? "")}</td></tr>
<tr><td>${esc(t("rcpt.date"))}</td><td class="r">${day(p.at)}</td></tr>
<tr><td>${esc(t("rcpt.method"))}</td><td class="r">${esc(t(`pay.${p.method}` as DictKey))}${p.reference ? ` · ${esc(p.reference === "stripe-simulated" ? t("pay.testMode") : p.reference)}` : ""}</td></tr>
${inv ? `<tr><td>${esc(t("rcpt.forInvoice"))}</td><td class="r">${esc([inv.number, inv.title].filter(Boolean).join(" · "))}</td></tr>` : ""}
<tr class="tot"><td>${esc(t("rcpt.amount"))}</td><td class="r">${money(p.amountCents)}</td></tr>
${inv ? `<tr><td>${esc(t("rcpt.balanceAfter"))}</td><td class="r">${money(balance)}</td></tr>` : ""}
</table>
<p class="ok">✓ ${esc(t("rcpt.thanks"))}</p>`;
  return page(`${t("rcpt.title")} ${p.receiptNumber ?? ""}`.trim(), company, body);
}
