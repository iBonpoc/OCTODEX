/**
 * The project library (docs/README.md; plan — docs/notes/2026-11-25-operating-model-design.md §16.4).
 *   Cover: every top-level document and folder of docs/ is named on the cover — no document nobody can find.
 *   Section: every folder has a README.md, and every document directly in it is named there (docs/notes — README only).
 *   Header: a document has «Статус:» in its first lines (действует / черновик / заменён на …) and the date it was checked.
 *     Old documents without a header are listed in docsHeaderLeft.json; the list only shrinks: a new document
 *     without a header is red, and a listed one that got its header must leave the list.
 *   Nested: a document in a sub-folder of a section (docs/notes and docs/archive aside) is named by a README on its way up
 *     to the section — by its file name or its path from that README; a folder without its own README may instead be named
 *     whole, as «folder/» (#2896).
 *   design/README.md names every file and folder of design/ (an .html by its name without the extension, a folder as «name/»).
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
/** «Статус:» as a plain line, a quote line («> Статус:») or a list item («- **Статус:**») — the forms the library already uses. */
const STATUS = /^(> ?|- )?(\*\*)?Статус:/;
const hasHeader = (file: string) =>
  read(file)
    .split("\n")
    .slice(0, 8)
    .some((l) => STATUS.test(l));

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

/** the README files on the way from a document's folder up to its section (nearest first) */
function readmesUp(file: string): string[] {
  const out: string[] = [];
  for (let dir = path.dirname(file); dir.startsWith(DOCS + path.sep); dir = path.dirname(dir)) {
    const r = path.join(dir, "README.md");
    if (fs.existsSync(r)) out.push(r);
  }
  return out;
}
/** is a nested document named by one of the README files above it (`readmes`: path → text, nearest first)? */
function nestedNamed(file: string, readmes: { path: string; text: string }[]): boolean {
  const ownReadme = readmes.some((r) => path.dirname(r.path) === path.dirname(file));
  return readmes.some(({ path: r, text }) => {
    const from = path.relative(path.dirname(r), file).split(path.sep).join("/");
    const folders = path.dirname(from).split("/").filter((d) => d !== ".");
    return text.includes(path.basename(file)) || text.includes(from) || (!ownReadme && folders.some((d) => text.includes("`" + d + "/")));
  });
}
/** names of design/ entries its README misses */
function designMissing(entries: { name: string; dir: boolean }[], text: string): string[] {
  return entries
    .filter((e) => e.name !== "README.md")
    .filter((e) => !text.includes(e.dir ? e.name + "/" : e.name.replace(/\.html$/, "")))
    .map((e) => e.name);
}

describe("docs library: nested folders and design/", () => {
  const SKIP = ["notes/", "archive/"];
  const nested = walk(DOCS).filter(
    (f) => rel(f).split("/").length > 2 && path.basename(f) !== "README.md" && !SKIP.some((p) => rel(f).startsWith(p)),
  );
  it("every document in a sub-folder of a section is named by a README above it", () => {
    const missing = nested.filter((f) => !nestedNamed(f, readmesUp(f).map((r) => ({ path: r, text: read(r) }))));
    expect(missing.map(rel)).toEqual([]);
  });
  it("design/README.md names every file and folder of design/", () => {
    const dir = path.join(ROOT, "design");
    const entries = fs.readdirSync(dir, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory() }));
    expect(designMissing(entries, read(path.join(dir, "README.md")))).toEqual([]);
  });
  it("the checks catch an unnamed document (they do not pass idly)", () => {
    const file = path.join(DOCS, "specs", "53-samples", "new.expected.md");
    const readme = path.join(DOCS, "specs", "README.md");
    expect(nestedNamed(file, [{ path: readme, text: "Папки: `img/` — снимки" }])).toBe(false);
    expect(nestedNamed(file, [{ path: readme, text: "Папки: `53-samples/` — образцы" }])).toBe(true);
    expect(nestedNamed(file, [{ path: readme, text: "| `53-samples/new.expected.md` |" }])).toBe(true);
    // a folder with its own README: naming the folder above is not enough
    const own = path.join(DOCS, "specs", "53-samples", "README.md");
    const both = [{ path: own, text: "Образцы: `other.md`" }, { path: readme, text: "Папки: `53-samples/` — образцы" }];
    expect(nestedNamed(file, both)).toBe(false);
    expect(designMissing([{ name: "new-style.html", dir: false }, { name: "gorix", dir: true }], "`naryad-ds/`")).toEqual(["new-style.html", "gorix"]);
    expect(designMissing([{ name: "paper-air.html", dir: false }, { name: "review", dir: true }], "`paper-air`, `review/`")).toEqual([]);
  });
});
