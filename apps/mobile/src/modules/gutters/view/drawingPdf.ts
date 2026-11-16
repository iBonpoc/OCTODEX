/**
 * «Чертёж в PDF» (founder 09.11, #509; spec 33 П20.25 п.4): two documents of a measurement from «Просмотр замера».
 * - for the client: the drawing and the gutters with their lengths, storey, profile and colour — no prices, no cut,
 *   in the CLIENT's language (rule 7: tFor(clientLangOf));
 * - for the crew: the drawing, every gutter along the wall and along the face, the corners' cut, the downspouts'
 *   fittings and the parts with their quantities — in the app's language (the company's own people).
 * The drawing is the sheet «как на бумаге» (#739, view/blueprint.ts) — the same one «Просмотр замера» shows — drawn by
 * the core (sheetSvg): the storey is a word («эт 2»), never a colour (rule 2). The page shell is the core's (docPage).
 */
import type { DictKey } from "@/i18n";
import { docPage, esc, type DocOpts } from "@/features/docPdf";
import type { PortalData } from "@/cloud/portal";
import { fmtLen, type LenFormat } from "../canvas/format";
import type { Drawing } from "../geometry";
import { blueprint } from "./blueprint";
import { sheetSvg } from "@/features/docPages";
import { dsLine, sizeText } from "../prices";
import { dsNumbers, foldDs, partGroups, type MeasureSpec } from "./spec";

type Tr = (key: DictKey, params?: Record<string, string | number>) => string;

/** a dictionary word, or the value itself when the company named it its own way (a colour of its own) */
const word = (t: Tr, key: string, raw: string) => {
  const v = t(key as DictKey);
  return v === key ? raw : v;
};

export interface DrawingPdfInput {
  kind: "client" | "crew";
  drawing: Drawing;
  spec: MeasureSpec;
  /** the client's language for «client», the app's for «crew» */
  t: Tr;
  opts: DocOpts;
  company: PortalData["company"];
  /** who and where: the client's or lead's name, the address */
  who?: string;
  address?: string;
  /** measured roughly: «measure again before cutting» */
  rough: boolean;
  /** today, as the document's date (US format) */
  date: string;
  /** the company's format of lengths (#1092): feet-inches when not said */
  fmt?: LenFormat;
}

export function drawingPdfHtml(x: DrawingPdfInput): string {
  const { t, spec } = x;
  const crew = x.kind === "crew";
  const fmt = x.fmt ?? "ftin";
  const len = (inches: number) => fmtLen(inches, fmt);
  // the drawing as on paper (#739): the same sheet as «Просмотр замера», in this document's language
  const sheet = x.drawing.runs.length ? blueprint(x.drawing, t, { company: x.company.name, address: x.address ?? x.who, date: x.date, rough: x.rough, fmt }) : null;
  const th = (k: DictKey) => `<th>${esc(t(k))}</th>`;
  // «эт N» only when the drawing has more than one storey (#1275, #1766)
  const story = spec.manyStories;
  const gutterOf = (r: MeasureSpec["runs"][number]) => `${word(t, `mod.gutters.attr.p.${r.profile}`, r.profile)} ${esc(sizeText(r.size))}`;
  const runs = spec.runs
    .map(
      (r) =>
        `<tr><td>${r.n}</td>${crew ? `<td>${esc(len(r.backIn))}</td><td><b>${esc(len(r.frontIn))}</b></td>` : `<td>${esc(len(r.backIn))}</td>`}${story ? `<td>${esc(t("mod.gutters.story", { n: r.story }))}</td>` : ""}<td>${esc(gutterOf(r))}</td><td>${esc(r.color ? word(t, `mod.gutters.attr.c.${r.color}`, r.color) : "")}</td></tr>`,
    )
    .join("");
  const runsTable = `<h2>${esc(t("mod.gutters.view.runs"))}</h2><table><tr>${th("mod.gutters.pdf.n")}${crew ? th("mod.gutters.pdf.wall") + th("mod.gutters.pdf.face") : th("mod.gutters.pdf.len")}${story ? th("mod.gutters.pdf.story") : ""}${th("mod.gutters.pdf.gutter")}${th("mod.gutters.pdf.color")}</tr>${runs}</table>`;
  const kindWord = (k: string) => t(k === "in" ? "mod.gutters.draw.cornerIn" : k === "out" ? "mod.gutters.draw.cornerOut" : "mod.gutters.draw.cornerBay");
  const corners = crew && spec.corners.length
    ? `<h2>${esc(t("mod.gutters.view.corners"))}</h2>${spec.corners
        .map((c) => `<p><b>${esc(t("mod.gutters.view.cornerTitle", { k: kindWord(c.kind), deg: c.angleDeg }))}</b><br>${c.runs.map((r) => esc(t("mod.gutters.view.cornerRun", { n: r.n, back: len(r.backIn), front: len(r.frontIn) }))).join("<br>")}</p>`)
        .join("")}`
    : "";
  const ds = spec.ds.length
    ? crew
      ? `<h2>${esc(t("mod.gutters.view.ds"))}</h2><table>${foldDs(spec.ds)
          .map(({ ns, d }) => {
            // the same downspouts are one row (#1766): «D1–D3 · 3 ea», the downspout's length the estimate counts
            const name = ns.length > 1 ? t("mod.gutters.view.dsMany", { list: dsNumbers(t, ns), n: ns.length }) : dsNumbers(t, ns);
            const what = [sizeText(d.size), d.dsStyle ? word(t, `mod.gutters.attr.st.${d.dsStyle}`, d.dsStyle) : "", d.color ? word(t, `mod.gutters.attr.c.${d.color}`, d.color) : "", story ? t("mod.gutters.story", { n: d.story }) : ""].filter(Boolean).join(" · ");
            const how = [dsLine(t, d), d.bottom !== "none" ? word(t, `mod.gutters.attr.b.${d.bottom}`, d.bottom) : ""].filter(Boolean).join(" · ");
            return `<tr><td><b>${esc(name)}</b></td><td>${esc(what)}</td><td>${esc(how)}</td><td class="r">${esc(len(d.lengthIn))}</td></tr>`;
          })
          .join("")}</table>`
      : `<p>${esc(t("mod.gutters.pdf.dsCount", { n: spec.ds.length }))}</p>`
    : "";
  const partsTable = crew && spec.parts.length
    ? `<h2>${esc(t("mod.gutters.view.parts"))}</h2><table>${partGroups(t, spec.parts, fmt)
        .map(
          // three groups (#1766, DS §8.14): the group's common properties once, then a row per part
          (g) =>
            `<tr><th colspan="2">${esc([g.title, ...g.common].join(" · "))}</th></tr>${g.rows
              .map((r) => `<tr><td><b>${esc(r.title)}</b>${r.props.length ? `<br>${esc(r.props.join(" · "))}` : ""}</td><td class="r">${esc(r.qty)}</td></tr>`)
              .join("")}`,
        )
        .join("")}</table>`
    : "";
  const rough = x.rough ? `<p class="note"><b>${esc(t("mod.gutters.view.rough"))}</b></p>` : "";
  const title = t(crew ? "mod.gutters.pdf.titleCrew" : "mod.gutters.pdf.title");
  const meta = [`${t("mod.gutters.pdf.date")}: ${x.date}`, x.who, x.address].filter(Boolean) as string[];
  const body = `${sheet ? sheetSvg(sheet) : ""}${rough}${runsTable}${corners}${ds}${partsTable}`;
  return docPage({ title, meta, footer: [title, x.company.name].filter(Boolean).join(" · "), company: x.company, body, opts: x.opts });
}

export const drawingPdfName = (kind: "client" | "crew", t: Tr, who?: string) =>
  [t(kind === "crew" ? "mod.gutters.pdf.titleCrew" : "mod.gutters.pdf.title"), who].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "").trim();
