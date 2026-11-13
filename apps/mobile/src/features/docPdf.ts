/**
 * Documents for the client as printable HTML (→ PDF via saveEstimatePdf): one page layout for the estimate,
 * the invoice and the receipt — the same company header and footer, in one of the three print styles.
 *
 * Rule 7 (founder 05.11.2026): what goes to a client is in the CLIENT's language. These functions take the
 * client's language (`lang`), never the app's translator — passing `t` is a type error (test/estimatePdf.test.ts).
 * Money in $, dates US numeric (11/05/2026) in every language. Colours and sizes only from the `print` tokens;
 * the brand colour is the company's own setting and is used only if it is a plain hex colour.
 */
import { findJob } from "@/data/jobs";
import { print as P, type PrintStyleName } from "@octo/design-tokens";
import { contractStatement } from "@octo/estimating-engine";
import { licenseLine, type PortalData } from "@/cloud/portal";
import type { DB, Invoice, Payment } from "@/data/types";
import type { DictKey } from "@/i18n";
import { tFor, type DocLang } from "@/i18n/translate";
import { getZone, zonedFormat } from "@/features/zone";

/** What a document function needs to know: the client's language and the company's print style. Never a translator. */
export interface DocOpts {
  lang: DocLang;
  style?: PrintStyleName;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** $ amounts, US format, the same for every client language */
export const docMoney = (cents: number) => (cents % 100 === 0 ? usd.format(cents / 100) : usdCents.format(cents / 100));
/**
 * 11/05/2026 — US numeric date, the same for every client language. A calendar day (YYYY-MM-DD) goes as it is;
 * a moment is shown on the company's day: its zone when given (E2b-2), else the app's company zone (zone.ts, П4b) —
 * never the device's.
 */
export const docDay = (iso: string, timeZone?: string) => {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (day) return `${day[2]}/${day[3]}/${day[1]}`;
  return zoned({ month: "2-digit", day: "2-digit", year: "numeric" }, timeZone).format(new Date(iso));
};
/** 3:05 PM on the company's clock (E2b-2) */
export const docTime = (iso: string, timeZone?: string) => zoned({ hour: "numeric", minute: "2-digit" }, timeZone).format(new Date(iso));
/** a formatter in the given zone, else the company's (an unknown zone falls back to Los Angeles, zone.ts) */
const zoned = (o: Intl.DateTimeFormatOptions, timeZone?: string): Intl.DateTimeFormat => zonedFormat(timeZone || getZone(), o);
/** the brand colour is typed by the company: only a plain hex colour reaches the CSS */
const safeColor = (c?: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : undefined);

export interface DocPageInput {
  /** "Estimate EST-0012" */
  title: string;
  /** right side under the title: "Date: 11/05/2026" … */
  meta: string[];
  /** repeated at the bottom of every printed page */
  footer: string;
  company: PortalData["company"];
  body: string;
  opts: DocOpts;
  /** #1324 (docs/specs/41): the document is a contract (an estimate — CA home improvement): no text below print.contract.minPt,
   *  section headings at least headingPt bold, `.notice` (a statutory phrase) noticePt bold */
  contract?: boolean;
}

/** One page shell for every client document: header (logo, company, licenses), body, repeated footer. */
export function docPage({ title, meta, footer, company: c, body, opts, contract }: DocPageInput): string {
  const s = P.styles[opts.style ?? "classic"];
  // the document's own sizes, raised to the contract floor when it is one (the style keeps its look above the floor)
  const fs = contract
    ? {
        title: Math.max(s.fontPt.title, P.contract.minPt),
        heading: Math.max(s.fontPt.heading, P.contract.headingPt),
        body: Math.max(s.fontPt.body, P.contract.minPt),
        small: Math.max(s.fontPt.small, P.contract.minPt),
      }
    : s.fontPt;
  const brand = safeColor(c.color);
  const lines = [
    c.address,
    ...c.contacts.map((x) => [[x.name, x.title].filter(Boolean).join(", "), x.phone].filter(Boolean).join(" · ")),
    c.contacts.length ? undefined : c.phone,
    c.email,
    c.website,
    ...c.licenses.map(licenseLine),
  ].filter(Boolean) as string[];
  const logo = c.logo && c.logo.startsWith("data:image/") ? `<img class="logo" src="${esc(c.logo)}" alt="">` : "";
  const who = `<div class="who">${logo}<div><h1>${esc(c.name || "OCTODEX")}</h1>${lines.map((l) => `<div class="mut">${esc(l)}</div>`).join("")}</div></div>`;
  const what = `<div class="what"><h1>${esc(title)}</h1>${meta.map((m) => `<div class="mut">${esc(m)}</div>`).join("")}</div>`;
  return `<!doctype html><html lang="${opts.lang}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
@page { margin: ${P.pagePadMm}mm; }
body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: ${P.ink}; background: ${P.paper}; font-size: ${fs.body}pt; margin: 0; }
h1 { font-size: ${fs.title}pt; margin: 0 0 4pt; }
h2 { font-size: ${fs.heading}pt; margin: ${s.sectionGapPt}pt 0 4pt; }
.mut { color: ${P.mut}; font-size: ${fs.small}pt; }
.head { display: flex; flex-direction: ${s.logoSide === "right" ? "row-reverse" : "row"}; justify-content: space-between; gap: 12pt; padding-bottom: 8pt;${
    s.headRulePx ? ` border-bottom: ${s.headRulePx}px solid ${P.rule};` : ""
  } }
.who { display: flex; flex-direction: ${s.logoSide === "right" ? "row-reverse" : "row"}; gap: 10pt; align-items: flex-start; }
.what { text-align: ${s.logoSide === "right" ? "left" : "right"}; }
.logo { width: ${s.logoPt}pt; height: ${s.logoPt}pt; object-fit: contain; }
.band { height: ${s.brandBandPt}pt; background: ${brand ?? P.rule}; margin-bottom: 6pt; }
table { width: 100%; border-collapse: collapse; }
td, th { padding: ${s.rowPadPt}pt 0; border-bottom: 1px solid ${P.rule}; text-align: left; vertical-align: top; }
th { color: ${P.mut}; font-weight: 500; font-size: ${fs.small}pt; }
.r { text-align: right; white-space: nowrap; padding-left: 8pt; }
.grp td { font-weight: 600; padding-top: ${s.rowPadPt * 2}pt; }
.opt td { color: ${P.mut}; }
.d1 td:first-child { padding-left: ${s.rowPadPt * 4}pt; }
.subt td { font-weight: 600; }
.sums { width: 50%; margin-left: auto; margin-top: 6pt; }
.sums td { border: 0; padding: 2pt 0; }
.tot td { font-weight: 700; font-size: ${fs.heading}pt; }
.sums .tot td { border-top: 1px solid ${P.rule}; padding-top: 4pt; }
.note { margin-top: 10pt; white-space: pre-wrap; }
${contract ? `h2 { font-weight: 700; }
.notice { font-size: ${P.contract.noticePt}pt; font-weight: 700; color: ${P.ink}; margin-top: ${s.sectionGapPt}pt; }
.signoff { break-inside: avoid; page-break-inside: avoid; }` : ""}
.ok { color: ${P.okText}; font-weight: 600; }
.sigs { display: flex; gap: 24pt; margin-top: ${s.sectionGapPt}pt; break-inside: avoid; }
.sig { flex: 1; }
.sig .line { border-bottom: 1px solid ${P.ink}; min-height: 40pt; display: flex; align-items: flex-end; }
.record td { font-size: ${fs.small}pt; }
.foot { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; color: ${P.mut}; font-size: ${fs.small}pt; }
.page { padding-bottom: 18pt; }
</style></head><body>
<div class="page">
<div class="head">${who}${what}</div>
${s.brandBandPt && brand ? `<div class="band"></div>` : ""}
${body}
</div>
<div class="foot">${esc(footer)}</div>
</body></html>`;
}

const kindKey = (i: Invoice): DictKey => (i.kind === "deposit" ? "inv.kind.deposit" : i.kind === "progress" ? "inv.kind.progress" : "inv.kind.final");

export function invoiceHtml(db: DB, inv: Invoice, company: PortalData["company"], opts: DocOpts): string {
  const t = tFor(opts.lang);
  const money = docMoney;
  const day = docDay;
  const cust = db.customers.find((c) => c.id === inv.customerId);
  const job = findJob(db, inv.jobId);
  const prop = db.properties.find((p) => p.id === job?.propertyId);
  const pays = db.payments.filter((p) => p.invoiceId === inv.id);
  const jobInvoices = db.invoices.filter((i) => i.jobId === inv.jobId);
  const st = job ? contractStatement(job.amountCents, jobInvoices) : null;
  const prior = jobInvoices.filter((i) => i.id !== inv.id && (i.sentAt ?? "") <= (inv.sentAt ?? "~"));
  const body = `
<p><b>${esc(t("portal.for"))}:</b> ${esc(cust?.name ?? "")}<br>${esc([prop?.address, prop?.city].filter(Boolean).join(", "))}</p>
<h2>${esc(inv.title || t(kindKey(inv)))}</h2>
<table>
${job && st && inv.kind !== "deposit" ? `<tr><td>${esc(t("inv.contract"))}: ${esc(job.title)}</td><td class="r">${money(st.contract)}</td></tr>` : ""}
${inv.kind === "final" ? prior.map((i) => `<tr><td class="mut">${esc(t("inv.less"))} ${esc(i.number ?? "")} ${esc(i.title ?? "")}</td><td class="r mut">−${money(i.totalCents)}</td></tr>`).join("") : ""}
<tr class="tot"><td>${esc(t("inv.amount"))}</td><td class="r">${money(inv.totalCents)}</td></tr>
${pays.map((p) => `<tr><td class="mut">${esc(t("inv.paymentOn", { date: day(p.at) }))} · ${esc(t(`pay.${p.method}` as DictKey))}${p.receiptNumber ? ` · ${esc(p.receiptNumber)}` : ""}</td><td class="r mut">−${money(p.amountCents)}</td></tr>`).join("")}
<tr class="tot"><td>${esc(t("inv.balance"))}</td><td class="r">${money(Math.max(0, inv.totalCents - inv.paidCents))}</td></tr>
</table>
${inv.paidCents >= inv.totalCents ? `<p class="ok">✓ ${esc(t("inv.paidInFull"))}</p>` : ""}
${payInstructions(db, t)}`;
  const title = `${t("inv.title")} ${inv.number ?? ""}`.trim();
  return docPage({
    title,
    meta: [`${t("inv.date")}: ${day(inv.sentAt ?? inv.dueDate)}`, `${t("inv.due")}: ${day(inv.dueDate)}`],
    footer: [title, company.name].filter(Boolean).join(" · "),
    company,
    body,
    opts,
  });
}

function payInstructions(db: DB, t: ReturnType<typeof tFor>): string {
  const p = db.company?.payment;
  const lines = [p?.zelle ? `Zelle: ${p.zelle}` : "", p?.checkPayableTo ? `${t("inv.checkTo")} ${p.checkPayableTo}` : ""].filter(Boolean);
  return lines.length ? `<p class="mut">${lines.map(esc).join("<br>")}</p>` : "";
}

export function receiptHtml(db: DB, p: Payment, company: PortalData["company"], opts: DocOpts): string {
  const t = tFor(opts.lang);
  const money = docMoney;
  const day = docDay;
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
  const title = `${t("rcpt.title")} ${p.receiptNumber ?? ""}`.trim();
  return docPage({ title, meta: [`${t("rcpt.date")}: ${day(p.at)}`], footer: [title, company.name].filter(Boolean).join(" · "), company, body, opts });
}

/** SMS / email text for an invoice — in the CLIENT's language (rule 7). */
export function invoiceMessage(db: DB, inv: Invoice, company: PortalData["company"], lang: DocLang): { text: string; subject: string } {
  const t = tFor(lang);
  const p = db.company?.payment;
  const how = [p?.zelle ? `Zelle ${p.zelle}` : "", p?.checkPayableTo ? `${t("inv.checkTo")} ${p.checkPayableTo}` : ""].filter(Boolean).join(", ");
  const balance = Math.max(0, inv.totalCents - inv.paidCents);
  return {
    text: t("inv.sendText", { company: company.name, number: inv.number ?? "", amount: docMoney(balance), date: docDay(inv.dueDate), how: how || "—" }),
    subject: `${t("inv.title")} ${inv.number ?? ""}`.trim(),
  };
}

/** SMS / email text for a receipt — in the CLIENT's language (rule 7). */
export function receiptMessage(p: Payment, company: PortalData["company"], lang: DocLang): { text: string; subject: string } {
  const t = tFor(lang);
  return {
    text: t("rcpt.sendText", { company: company.name, amount: docMoney(p.amountCents), number: p.receiptNumber ?? "", date: docDay(p.at) }),
    subject: `${t("rcpt.title")} ${p.receiptNumber ?? ""}`.trim(),
  };
}
