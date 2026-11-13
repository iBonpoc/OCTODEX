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
import { activeLines, ppmToPctText, taxRatePpm } from "@octo/estimating-engine";
import { print as P } from "@octo/design-tokens";
import { SIG_BOX, fitSignature } from "./signaturePath";
import type { DictKey } from "@/i18n";
import { tFor } from "@/i18n/translate";
import type { PortalData } from "@/cloud/portal";
import { optionTotals, shownQty, withAddons } from "./estimateDoc";
import { docDay, docMoney, docPage, docTime, esc, type DocOpts } from "./docPdf";
import { pagesHtml } from "./docPages";
import { clientRows } from "./clientLayout";

export interface EstimatePdfOpts extends DocOpts {
  /** company setting «Show unit prices» (docs/specs/07 §3.4); on by default */
  showUnitPrices?: boolean;
  /** the client's current choice on the page /p/ («Download PDF»): that option and those add-ons — the PDF repeats the page, the chosen
   *  add-ons are in the lines and the total. Not given (the company's own PDF of an unsigned estimate): every add-on is there as
   *  «(add-on) + $X» and none is in the total. A signed estimate always shows the signed choice. */
  choice?: { optionId: string; addonIds: string[] };
}

export function estimateHtml(p: PortalData, opts: EstimatePdfOpts): string {
  const t = tFor(opts.lang);
  const money = docMoney;
  const tz = p.company.timezone;
  const day = (iso: string) => docDay(iso, tz);
  const time = (iso: string) => docTime(iso, tz);
  const unit = opts.showUnitPrices !== false;
  const doc = p.doc;
  const options = doc?.options ?? [];
  // the choice that counts: the signed one, else the client's on the page, else none (every option, every add-on as an offer)
  const pick = p.approval ? { optionId: p.approval.optionId, addonIds: p.approval.addonIds } : opts.choice;
  const chosen = pick ? options.filter((o) => o.id === pick.optionId) : options;
  const cols = unit ? 4 : 3;
  const blocks = chosen
    .map((o0) => {
      const o = pick ? withAddons(o0, pick.addonIds) : o0;
      const tot = optionTotals(doc!, o);
      const act = activeLines(o.lines);
      const row = (i: number, depth: 0 | 1) => {
        const l = act[i]!;
        return `<tr class="${[l.optional && !l.selected ? "opt" : "", depth ? "d1" : ""].filter(Boolean).join(" ")}"><td>${esc(l.name)}${l.optional ? ` <span class="mut">(${esc(t("ue.addonChip"))})</span>` : ""}${
          l.description ? `<div class="mut">${esc(l.description)}</div>` : ""
        }</td><td class="r">${esc(shownQty(l.quantity))} ${esc(l.unit)}</td>${unit ? `<td class="r">${money(l.unitPriceCents)}</td>` : ""}<td class="r">${l.optional && !l.selected ? "+ " : ""}${money(tot.lineTotals[i] ?? 0)}</td></tr>`;
      };
      // sections (when the option has them) with their lines, subsections and subtotals, then «Other items»; else the lines by kind.
      // Every word a person typed (a section's title, a line's name) goes through esc(); the dictionary's words are the client's language.
      const groups = clientRows(o, doc!.settings, t, p.approval ? "selected" : "all")
        .map((r) => {
          if (r.type === "group") return `<tr class="grp"><td colspan="${cols}">${esc(t(`ue.group.${r.group}` as DictKey))}</td></tr>`;
          if (r.type === "section") return `<tr class="grp${r.depth ? " d1" : ""}"><td colspan="${cols}">${esc(r.title)}</td></tr>`;
          if (r.type === "other") return `<tr class="grp"><td colspan="${cols}">${esc(r.title)}</td></tr>`;
          if (r.type === "subtotal") return `<tr class="subt"><td colspan="${cols - 1}">${esc(t("est.client.subtotal", { title: r.title }))}</td><td class="r">${money(r.cents)}</td></tr>`;
          return row(r.i, r.depth);
        })
        .join("");
      const s = doc!.settings;
      const sums = [
        `<tr><td>${esc(t("ue.subtotal"))}</td><td class="r">${money(tot.subtotal)}</td></tr>`,
        tot.discount ? `<tr><td>${esc(t("ue.discount"))}</td><td class="r">−${money(tot.discount)}</td></tr>` : "",
        tot.tax ? `<tr><td>${esc(t("ue.taxLine", { rate: ppmToPctText(taxRatePpm(s.tax)) }))}</td><td class="r">${money(tot.tax)}</td></tr>` : "",
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
    `<svg viewBox="0 0 ${SIG_BOX.w} ${SIG_BOX.h}" width="200" height="80"><path d="${esc(fitSignature(path))}" stroke="${P.ink}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const company = p.company.name || "OCTODEX";
  // E2b-2: the employee signs in their own name «for the company», with the title and the HIS number when given
  const cs = p.countersign;
  const companySig = cs
    ? `<div class="sig"><div class="mut">${esc(t("est.pdf.contractor"))}</div><div class="line">${cs.signature ? sigSvg(cs.signature) : ""}</div><div>${esc(cs.signerName)}${
        cs.signerTitle ? `, ${esc(cs.signerTitle)}` : ""
      }</div><div>${esc(t("est.pdf.forCompany", { company }))}</div>${cs.his ? `<div class="mut">${esc(t("est.pdf.his", { n: cs.his }))}</div>` : ""}<div class="mut">${esc(day(cs.signedAt))}</div></div>`
    : `<div class="sig"><div class="mut">${esc(t("est.pdf.contractor"))}</div><div class="line"></div><div>${esc(t("est.pdf.forCompany", { company }))}</div><div class="mut">${esc(t("est.pdf.awaitingSignature"))}</div></div>`;
  const signatures = `<div class="sigs">
<div class="sig"><div class="mut">${esc(t("est.pdf.customer"))}</div><div class="line">${a?.signature ? sigSvg(a.signature) : ""}</div><div>${esc(a?.signerName ?? p.customer.name)}</div><div class="mut">${
    a ? esc(day(a.signedAt)) : esc(t("est.pdf.awaitingSignature"))
  }</div></div>
${companySig}
</div>`;
  const record = a
    ? `<h2>${esc(t("est.pdf.record"))}</h2><table class="record"><thead><tr><th>${esc(t("est.pdf.signer"))}</th><th>${esc(t("est.pdf.when"))}</th><th>${esc(t("est.pdf.how"))}</th></tr></thead><tbody>
<tr><td>${esc(t("est.pdf.customer"))}: ${esc(a.signerName)}</td><td>${esc(day(a.signedAt))} ${esc(time(a.signedAt))}</td><td>${esc(t("est.pdf.eSignature"))}${
    a.channel === "on_site" ? ` · ${esc(a.deviceUser ? t("est.pdf.onSiteDevice", { name: a.deviceUser }) : t("est.pdf.onSite"))}` : ""
  }</td></tr>${
    cs
      ? `<tr><td>${esc(t("est.pdf.contractor"))}: ${esc(cs.signerName)}</td><td>${esc(day(cs.signedAt))} ${esc(time(cs.signedAt))}</td><td>${esc(t("est.pdf.eSignature"))}</td></tr>`
      : ""
  }
</tbody></table>`
    : "";
  // #1304: «Notes» and «Terms & conditions» under their headings, in the client's language; Terms (the estimate's own text,
  // or the company's default for an older estimate — p.terms) before the signatures, in the document's own font (never the
  // small grey one); the contractor's text goes through esc()
  const notesHtml = typeof doc?.note === "string" && doc.note.trim() ? `<h2>${esc(t("est.doc.notes"))}</h2><div class="note">${esc(doc.note)}</div>` : "";
  const termsHtml = p.terms.trim() ? `<h2>${esc(t("est.doc.terms"))}</h2><div class="note">${esc(p.terms)}</div>` : "";
  const title = `${t("portal.estimate")} ${p.number ?? ""}`.trim();
  const contacts = [p.customer.phone, p.customer.email].filter(Boolean).map((x) => esc(x!)).join(" · ");
  const body = `
<p><b>${esc(t("portal.for"))}:</b> ${esc(p.customer.name)}<br>${esc(p.property.address)}${p.property.city ? `, ${esc(p.property.city)}` : ""}${
    contacts ? `<br>${contacts}` : ""
  }</p>
${p.title ? `<p><b>${esc(p.title)}</b></p>` : ""}
${blocks}
${notesHtml}
${termsHtml}
<p class="mut">${esc(t("est.rescission"))}</p>
${a ? `<p class="ok">✓ ${esc(t("portal.approved"))}</p>` : ""}
${signatures}
${record}
${pagesHtml(doc?.pages)}`;
  return docPage({
    title,
    // «Valid until» only while it matters: the client has not signed yet (founder 05.11)
    meta: [`${t("portal.date")}: ${day(p.sentAt ?? new Date().toISOString())}`, ...(p.validUntil && !a ? [`${t("est.pdf.validUntil")}: ${day(p.validUntil)}`] : [])],
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
