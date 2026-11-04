/**
 * Estimate as a printable HTML page → PDF.
 * Phone (iOS/Android): expo-print renders a PDF file, the share sheet saves or sends it.
 * Web: the browser print dialog ("Save as PDF").
 * Only client-visible data goes in (no costs). Colors/sizes from the `print` tokens.
 */
import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { LINE_GROUPS, activeLines } from "@octo/estimating-engine";
import { print as P } from "@octo/design-tokens";
import type { DictKey } from "@/i18n";
import type { PortalData } from "@/cloud/portal";
import { optionTotals, withAddons } from "./estimateDoc";

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

export function estimateHtml(
  p: PortalData,
  fmt: { t: (k: DictKey, params?: Record<string, string | number>) => string; money: (c: number) => string; day: (iso: string) => string },
): string {
  const { t, money, day } = fmt;
  const doc = p.doc;
  const options = doc?.options ?? [];
  const chosen = p.approval ? options.filter((o) => o.id === p.approval!.optionId) : options;
  const blocks = chosen
    .map((o0) => {
      const o = p.approval ? withAddons(o0, p.approval.addonIds) : o0;
      const tot = optionTotals(doc!, o);
      const act = activeLines(o.lines);
      const row = (i: number) => {
        const l = act[i]!;
        return `<tr${l.optional && !l.selected ? ' class="opt"' : ""}><td>${esc(l.name)}${l.optional ? ` <span class="mut">(${esc(t("ue.addonChip"))})</span>` : ""}${
          l.description ? `<div class="mut">${esc(l.description)}</div>` : ""
        }</td><td class="r">${esc(String(l.quantity))} ${esc(l.unit)}</td><td class="r">${money(l.unitPriceCents)}</td><td class="r">${money(tot.lineTotals[i] ?? 0)}</td></tr>`;
      };
      const groups = LINE_GROUPS.map((g) => {
        const idx = act.map((l, i) => (l.group === g ? i : -1)).filter((i) => i >= 0);
        if (!idx.length) return "";
        return `<tr class="grp"><td colspan="4">${esc(t(`ue.group.${g}` as DictKey))}</td></tr>${idx.map(row).join("")}`;
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
<table class="lines"><thead><tr><th></th><th class="r">${esc(t("ue.qty"))}</th><th class="r">${esc(t("ue.price"))}</th><th class="r">${esc(t("ue.total"))}</th></tr></thead><tbody>${groups}</tbody></table>
<table class="sums">${sums}</table>`;
    })
    .join("");
  const signed = p.approval
    ? `<div class="sig"><div class="ok">✓ ${esc(t("portal.approved"))}</div><div>${esc(t("ue.approvedBy", { name: p.approval.signerName, date: day(p.approval.signedAt) }))}</div>${
        p.approval.signature ? `<svg viewBox="0 0 400 160" width="260" height="104"><path d="${esc(p.approval.signature)}" stroke="${P.ink}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>` : ""
      }</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(t("portal.estimate"))} ${esc(p.number ?? "")}</title>
<style>
@page { margin: ${P.pagePadMm}mm; }
body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: ${P.ink}; background: ${P.paper}; font-size: ${P.fontPt.body}pt; margin: 0; }
h1 { font-size: ${P.fontPt.title}pt; margin: 0 0 4pt; }
h2 { font-size: ${P.fontPt.heading}pt; margin: 14pt 0 4pt; }
.mut { color: ${P.mut}; font-size: ${P.fontPt.small}pt; }
.head { display: flex; justify-content: space-between; gap: 12pt; border-bottom: 1px solid ${P.rule}; padding-bottom: 8pt; }
table { width: 100%; border-collapse: collapse; }
.lines td, .lines th { padding: 4pt 0; border-bottom: 1px solid ${P.rule}; vertical-align: top; }
.lines th { color: ${P.mut}; font-weight: 500; font-size: ${P.fontPt.small}pt; }
.grp td { font-weight: 600; padding-top: 8pt; }
.opt td { color: ${P.mut}; }
.r { text-align: right; white-space: nowrap; padding-left: 8pt; }
.sums { width: 50%; margin-left: auto; margin-top: 6pt; }
.sums td { padding: 2pt 0; }
.tot td { font-weight: 700; font-size: ${P.fontPt.heading}pt; border-top: 1px solid ${P.rule}; padding-top: 4pt; }
.note { margin-top: 10pt; white-space: pre-wrap; }
.sig { margin-top: 16pt; }
.ok { color: ${P.okText}; font-weight: 600; }
</style></head><body>
<div class="head"><div><h1>${esc(p.company.name || "OCTODEX")}</h1>${p.company.phone ? `<div class="mut">${esc(p.company.phone)}</div>` : ""}${
    p.company.email ? `<div class="mut">${esc(p.company.email)}</div>` : ""
  }${p.company.license ? `<div class="mut">Lic. ${esc(p.company.license)}</div>` : ""}</div>
<div style="text-align:right"><h1>${esc(t("portal.estimate"))} ${esc(p.number ?? "")}</h1><div class="mut">${esc(t("portal.date"))}: ${day(p.sentAt ?? new Date().toISOString())}</div></div></div>
<p><b>${esc(t("portal.for"))}:</b> ${esc(p.customer.name)}<br>${esc(p.property.address)}${p.property.city ? `, ${esc(p.property.city)}` : ""}</p>
${p.title ? `<p><b>${esc(p.title)}</b></p>` : ""}
${blocks}
${doc?.note ? `<div class="note">${esc(doc.note)}</div>` : ""}
<p class="mut">${esc(t("est.rescission"))}</p>
${signed}
</body></html>`;
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
