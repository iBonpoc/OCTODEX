/**
 * The project library (docs/README.md; plan — docs/notes/2026-11-25-operating-model-design.md §16.4).
 *   Cover: every top-level document and folder of docs/ is named on the cover — no document nobody can find.
 *   Section: every folder has a README.md, and every document directly in it is named there (docs/notes — README only).
 *   Header: a document has «Статус:» in its first lines (действует / черновик / заменён на …) and the date it was checked.
 *     Old documents without a header are listed in docsHeaderLeft.json; the list only shrinks: a new document
 *     without a header is red, and a listed one that got its header must leave the list.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../..");
const DOCS = path.join(ROOT, "docs");
const read = (p: string) => fs.readFileSync(p, "utf8");
const rel = (p: string) => path.relative(DOCS, p).split(path.sep).join("/");
const HEADER_LEFT: string[] = JSON.parse(read(path.join(__dirname, "docsHeaderLeft.json")));

/** Working materials and the archive: no header and no line per file (cover §9, §12). */
const NO_HEADER = ["notes/", "archive/"];
const NO_LIST = ["notes"];

const topDirs = fs
  .readdirSync(DOCS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();
const topDocs = fs
  .readdirSync(DOCS)
  .filter((f) => f.endsWith(".md") && f !== "README.md")
  .sort();

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : e.name.endsWith(".md") ? [p] : [];
  });
}
const hasHeader = (file: string) =>
  read(file)
    .split("\n")
    .slice(0, 8)
    .some((l) => l.startsWith("Статус:"));

describe("docs library: cover", () => {
  const cover = read(path.join(DOCS, "README.md"));
  it("names every top-level document", () => {
    expect(topDocs.filter((f) => !cover.includes("`" + f + "`"))).toEqual([]);
  });
  it("names every folder", () => {
    expect(topDirs.filter((d) => !cover.includes("`" + d + "/"))).toEqual([]);
  });
});

describe("docs library: sections", () => {
  it.each(topDirs)("%s/ has a README.md that names its documents", (dir) => {
    const readme = path.join(DOCS, dir, "README.md");
    expect(fs.existsSync(readme), `docs/${dir}/README.md`).toBe(true);
    if (NO_LIST.includes(dir)) return;
    const text = read(readme);
    const docs = fs.readdirSync(path.join(DOCS, dir)).filter((f) => f.endsWith(".md") && f !== "README.md");
    expect(docs.filter((f) => !text.includes(f))).toEqual([]);
  });
});

describe("docs library: header", () => {
  const all = walk(DOCS).filter((f) => !NO_HEADER.some((p) => rel(f).startsWith(p)));
  it("a document has «Статус:» in its first lines, or is an old one in docsHeaderLeft.json", () => {
    expect(all.filter((f) => !hasHeader(f) && !HEADER_LEFT.includes(rel(f))).map(rel)).toEqual([]);
  });
  it("docsHeaderLeft.json only shrinks: every entry exists and still has no header", () => {
    const stale = HEADER_LEFT.filter((p) => !fs.existsSync(path.join(DOCS, p)) || hasHeader(path.join(DOCS, p)));
    expect(stale).toEqual([]);
  });
  it("the cover, the decisions and every section README carry a header", () => {
    const must = [path.join(DOCS, "README.md"), ...topDirs.map((d) => path.join(DOCS, d, "README.md"))]
      .filter((f) => fs.existsSync(f))
      .concat(walk(path.join(DOCS, "decisions")));
    expect(must.filter((f) => !hasHeader(f) && !HEADER_LEFT.includes(rel(f))).map(rel)).toEqual([]);
  });
});
