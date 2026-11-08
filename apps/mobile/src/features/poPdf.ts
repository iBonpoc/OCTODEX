/**
 * The purchase order as a printable page (docs/specs/37 §6) → PDF via saveEstimatePdf. The supplier is in the US: the
 * order is in English (spec 36 №19, PRD 11 §7.5) — this function takes the language, never the app's translator. The
 * client's name is not printed: the job's number and the street are enough (PRD 11 §15 №3). Prices only when the
 * office asked for them (print_prices) and only from who sees costs. Money through the engine (orderCostCents).
 */
import { orderCostCents } from "@octo/estimating-engine";
import type { PortalData } from "@/cloud/portal";
import type { DB, PurchaseOrder } from "@/data/types";
import { tFor, type DocLang } from "@/i18n/translate";
import { docDay, docMoney, docPage, esc, type DocOpts } from "./docPdf";

export function poHtml(db: DB, o: PurchaseOrder, company: PortalData["company"], opts: DocOpts & { lang: DocLang }): string {
  const t = tFor(opts.lang);
  const number = o.number ?? "";
  const job = o.jobId ? db.jobs.find((j) => j.id === o.jobId) : undefined;
  const sup = o.supplierId ? (db.suppliers ?? []).find((s) => s.id === o.supplierId) : undefined;
  const prices = o.printPrices && o.lines.every((l) => l.costCents !== undefined);
  const to = [o.supplierName ?? sup?.name, o.supplierAddress ?? sup?.address, o.supplierPhone ?? sup?.phone, o.supplierEmail ?? sup?.email].filter(Boolean) as string[];
  const meta = [
    `${t("po.pdf.date")}: ${docDay(o.sentAt ?? new Date().toISOString())}`,
    ...(o.revision > 1 ? [t("po.pdf.rev", { n: o.revision })] : []),
    ...(job?.number ? [`${t("po.pdf.job")}: ${job.number}`] : []),
    ...(o.neededOn ? [`${t("po.pdf.needed")}: ${docDay(`${o.neededOn}T12:00:00Z`)}`] : []),
  ];
  const rows = o.lines
    .map(
      (l) => `<tr><td>${esc(l.supplierSku ?? "")}</td><td>${esc(l.name)}${l.note ? `<div class="mut">${esc(l.note)}</div>` : ""}</td><td class="r">${esc(l.qty)}</td><td>${esc(l.unit)}</td>${
        prices ? `<td class="r">${docMoney(l.costCents!)}</td><td class="r">${docMoney(orderCostCents([{ qty: l.qty, costCents: l.costCents! }]))}</td>` : ""
      }</tr>`,
    )
    .join("");
  const total = prices ? orderCostCents(o.lines.map((l) => ({ qty: l.qty, costCents: l.costCents! }))) : undefined;
  const body = `
<p><b>${esc(t("po.pdf.to"))}:</b> ${to.map(esc).join("<br>")}${sup?.accountNumber ? `<br><b>${esc(t("po.pdf.account"))}:</b> ${esc(sup.accountNumber)}` : ""}</p>
<p><b>${esc(o.fulfillment === "pickup" ? t("po.pdf.pickup") : t("po.pdf.deliver"))}${o.fulfillment === "pickup" ? "" : ":"}</b> ${o.fulfillment === "pickup" ? "" : esc(o.deliverTo ?? "")}</p>
<table>
<tr><th>${esc(t("po.pdf.sku"))}</th><th>${esc(t("po.pdf.item"))}</th><th class="r">${esc(t("po.pdf.qty"))}</th><th>${esc(t("po.pdf.unit"))}</th>${
    prices ? `<th class="r">${esc(t("po.pdf.price"))}</th><th class="r">${esc(t("po.pdf.amount"))}</th>` : ""
  }</tr>
${rows}
</table>
${total !== undefined ? `<table class="sums"><tr class="tot"><td>${esc(t("po.pdf.total"))}</td><td class="r">${docMoney(total)}</td></tr></table>` : ""}
${o.note ? `<div class="note"><b>${esc(t("po.pdf.note"))}:</b> ${esc(o.note)}</div>` : ""}`;
  return docPage({
    title: t("po.pdf.title", { number }),
    meta,
    footer: t("po.pdf.footer", { company: company.name, number }),
    company,
    body,
    opts,
  });
}
