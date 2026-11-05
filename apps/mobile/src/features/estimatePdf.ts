/**
 * Estimate (and, once signed, the contract) as a printable HTML page → PDF, in the CLIENT's language (rule 7).
 * Phone (iOS/Android): expo-print renders a PDF file, the share sheet saves or sends it (SMS / iMessage / WhatsApp / mail).
 * Web: the browser print dialog ("Save as PDF").
 * Only client-visible data goes in (no costs). Text the contractor typed (line names, notes) goes as typed.
 * Layout and the company header are shared with the invoice and the receipt (docPdf.ts).
 */
import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { LINE_GROUPS, activeLines } from "@octo/estimating-engine";
import { print as P } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import { tFor } from "@/i18n/translate";
import type { PortalData } from "@/cloud/portal";
import { optionTotals, withAddons } from "./estimateDoc";
import { docDay, docMoney, docPage, esc, type DocOpts } from "./docPdf";

export interface EstimatePdfOpts extends DocOpts {
  /** company setting «Show unit prices» (docs/specs/07 §3.4); on by default */
  showUnitPrices?: boolean;
}

const usTime = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

export function estimateHtml(p: PortalData, opts: EstimatePdfOpts): string {
  const t = tFor(opts.lang);
  const money = docMoney;
  const day = docDay;
  const unit = opts.showUnitPrices !== false;
  const doc = p.doc;
  const options = doc?.options ?? [];
  const chosen = p.approval ? options.filter((o) => o.id === p.approval!.optionId) : options;
  const cols = unit ? 4 : 3;
  const blocks = chosen
    .map((o0) => {
      const o = p.approval ? withAddons(o0, p.approval.addonIds) : o0;
      const tot = optionTotals(doc!, o);
      const act = activeLines(o.lines);
      const row = (i: number) => {
        const l = act[i]!;
        return `<tr${l.optional && !l.selected ? ' class="opt"' : ""}><td>${esc(l.name)}${l.optional ? ` <span class="mut">(${esc(t("ue.addonChip"))})</span>` : ""}${
          l.description ? `<div class="mut">${esc(l.description)}</div>` : ""
        }</td><td class="r">${esc(String(l.quantity))} ${esc(l.unit)}</td>${unit ? `<td class="r">${money(l.unitPriceCents)}</td>` : ""}<td class="r">${money(tot.lineTotals[i] ?? 0)}</td></tr>`;
      };
      const groups = LINE_GROUPS.map((g) => {
        const idx = act.map((l, i) => (l.group === g ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) return "";
        return `<tr class="grp"><td colspan="${cols}">${esc(t(`ue.group.${g}` as DictKey))}</td></tr>${idx.map(row).join("")}`;
      }).join("");
      const s = doc!.settings;
      const sums = [
        `<tr><td>${esc(t("ue.subtotal"))}</td><td class="r">${money(tot.subtotal)}</td></tr>`,
        tot.discount ? `<tr><td>${esc(t("ue.discount"))}</td><td class="r">−${money(tot.discount)}</td></tr>` : "",
        tot.tax ? `<tr><td>${esc(t("ue.taxLine", { rate: (s.tax.rateBps / 100).toString() }))}</td><td class="r">${money(tot.tax)}</td></tr>` : "",
        `<tr class="tot"><td>${esc(t("ue.total"))}</td><td class="r">${money(tot.total)}</td></tr>`,
        tot.deposit ? `<tr><td>${esc(t("ue.deposit"))}</td><td class="r">${money(tot.deposit)}</td></tr>` : "",
      ].join("");
      return `<h2>${esc(o.name)}${o.recommended && options.length > 1 ? ` · ${esc(t("ue.recommended"))}` : ""}</h2>
<table class="lines"><thead><tr><th></th><th class="r">${esc(t("ue.qty"))}</th>${unit ? `<th class="r">${esc(t("ue.price"))}</th>` : ""}<th class="r">${esc(t("ue.total"))}</th></tr></thead><tbody>${groups}</tbody></table>
<table class="sums">${sums}</table>`;
    })
    .join("");
  const a = p.approval;
  const sigSvg = (path: string) =>
    `<svg viewBox="0 0 400 160" width="200" height="80"><path d="${esc(path)}" stroke="${P.ink}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const company = p.company.name || "OCTODEX";
  const signatures = `<div class="sigs">
<div class="sig"><div class="mut">${esc(t("est.pdf.customer"))}</div><div class="line">${a?.signature ? sigSvg(a.signature) : ""}</div><div>${esc(a?.signerName ?? p.customer.name)}</div><div class="mut">${
    a ? esc(day(a.signedAt)) : esc(t("est.pdf.awaitingSignature"))
  }</div></div>
<div class="sig"><div class="mut">${esc(t("est.pdf.contractor"))}</div><div class="line"></div><div>${esc(t("est.pdf.forCompany", { company }))}</div><div class="mut">${esc(t("est.pdf.awaitingSignature"))}</div></div>
</div>`;
  const record = a
    ? `<h2>${esc(t("est.pdf.record"))}</h2><table class="record"><thead><tr><th>${esc(t("est.pdf.signer"))}</th><th>${esc(t("est.pdf.when"))}</th><th>${esc(t("est.pdf.how"))}</th></tr></thead><tbody>
<tr><td>${esc(t("est.pdf.customer"))}: ${esc(a.signerName)}</td><td>${esc(day(a.signedAt))} ${esc(usTime.format(new Date(a.signedAt)))}</td><td>${esc(t("est.pdf.eSignature"))}</td></tr>
</tbody></table>`
    : "";
  const title = `${t("portal.estimate")} ${p.number ?? ""}`.trim();
  const body = `
<p><b>${esc(t("portal.for"))}:</b> ${esc(p.customer.name)}<br>${esc(p.property.address)}${p.property.city ? `, ${esc(p.property.city)}` : ""}</p>
${p.title ? `<p><b>${esc(p.title)}</b></p>` : ""}
${blocks}
${doc?.note ? `<div class="note">${esc(doc.note)}</div>` : ""}
${p.company.terms ? `<div class="note mut">${esc(p.company.terms)}</div>` : ""}
<p class="mut">${esc(t("est.rescission"))}</p>
${a ? `<p class="ok">✓ ${esc(t("portal.approved"))}</p>` : ""}
${signatures}
${record}`;
  return docPage({
    title,
    meta: [`${t("portal.date")}: ${day(p.sentAt ?? new Date().toISOString())}`],
    footer: [title, company].join(" · "),
    company: p.company,
    body,
    opts,
  });
}

/** «EST-0012 Smith» — the estimate number and the client's last name; no characters a file system refuses. */
export function estimateFileName(p: Pick<PortalData, "number" | "customer">): string {
  const last = p.customer.name.trim().split(/\s+/).pop() ?? "";
  return [p.number, last].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "").trim() || "Estimate";
}

/** Save/share the PDF (phone) or open the print dialog (web). */
export async function saveEstimatePdf(html: string, fileName: string): Promise<void> {
  if (Platform.OS === "web") {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);
    const w = frame.contentWindow!;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.document.title = fileName;
    setTimeout(() => {
      w.focus();
      w.print();
      setTimeout(() => frame.remove(), 1000);
    }, 250);
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: fileName });
}
