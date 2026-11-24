/**
 * The shots folder and its index.json (#2360). ~/GoRix/notes/screens/<commit>/<file>.png + ~/GoRix/notes/screens/index.json
 * (GORIX_SHOTS_DIR overrides the folder). One entry per file; `keep` / `ref` entries are never cleaned.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = () => process.env.GORIX_SHOTS_DIR || path.join(os.homedir(), "GoRix", "notes", "screens");
const REQUIRED = { id: "string", file: "string", engine: "string", route: "string", role: "string", theme: "string", width: "number", lang: "string", commit: "string", branch: "string", takenAt: "string", by: "string", stamp: "string" };
const DAY = 86400000;

function slug(s) { return String(s).replace(/^\//, "").replace(/[/?=&#]+/g, "_").replace(/[^\p{L}\p{N}_.-]+/gu, "-") || "root"; }

/** the file name carries the same facts as the stamp: route · state · theme-width-lang-role · commit */
function fileName(e) {
  const bits = [e.theme, e.width, e.lang, e.role];
  if (e.font && e.font !== "normal") bits.push(e.font);
  if (e.reduceMotion) bits.push("rm");
  if (e.scroll != null) bits.push("s" + e.scroll);
  if (e.engine === "sim") bits.push("sim");
  const tail = e.frame ? `__f${String(e.frame).padStart(2, "0")}` : "";
  return `${slug(e.route)}${e.state ? "__" + e.state : ""}__${bits.join("-")}__${e.commit}${e.dirty ? "+" : ""}${tail}.png`;
}

/** the two stamp lines drawn UNDER the picture (never inside the interface) */
function stampLines(e) {
  const t = new Date(e.takenAt);
  const p = (n) => String(n).padStart(2, "0");
  const when = `${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
  return [
    `${e.branch} · ${e.commit}${e.dirty ? "+" : ""}`,
    `${when} · ${e.role} · ${e.theme} · ${e.width} · ${e.lang}${e.font && e.font !== "normal" ? " · " + e.font : ""}${e.state ? " · " + e.state : ""}${e.engine === "sim" ? " · SIM" : ""}`,
  ];
}

function validateEntry(e) {
  const errs = [];
  for (const [k, t] of Object.entries(REQUIRED)) if (typeof e[k] !== t) errs.push(`${k}: нужен ${t}`);
  if (e.file && (path.isAbsolute(e.file) || e.file.includes(".."))) errs.push("file: путь относительный, без «..»");
  if (e.takenAt && Number.isNaN(Date.parse(e.takenAt))) errs.push("takenAt: не дата");
  return errs;
}

const indexPath = () => path.join(root(), "index.json");
function readIndex() {
  try { const j = JSON.parse(fs.readFileSync(indexPath(), "utf8")); return j && j.version === 1 && Array.isArray(j.shots) ? j : { version: 1, shots: [] }; }
  catch { return { version: 1, shots: [] }; }
}
function writeIndex(idx) {
  fs.mkdirSync(root(), { recursive: true });
  const tmp = indexPath() + "." + process.pid + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 2) + "\n");
  fs.renameSync(tmp, indexPath());
}
function addEntry(e) {
  const errs = validateEntry(e);
  if (errs.length) throw new Error("index.json: " + errs.join("; "));
  const idx = readIndex();
  idx.shots = idx.shots.filter((x) => x.file !== e.file);
  idx.shots.push(e);
  writeIndex(idx);
  return e;
}

/** `shot:find client dark 390 abc1234` — every word must occur in the entry's facts; newest first */
function find(words, opts = {}) {
  const idx = readIndex();
  const ws = words.map((w) => w.toLowerCase());
  return idx.shots
    .filter((e) => (!opts.commit || e.commit === opts.commit))
    .filter((e) => { const hay = [e.route, e.state, e.theme, String(e.width), e.lang, e.role, e.font, e.commit, e.branch, e.engine, e.file, e.by].join(" ").toLowerCase(); return ws.every((w) => hay.includes(w)); })
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

/** removes commit sets older than `days`, except entries marked keep / ref; returns the removed file names */
function gc(days = 14, now = Date.now()) {
  const idx = readIndex();
  const removed = [];
  idx.shots = idx.shots.filter((e) => {
    if (e.keep || e.ref) return true;
    if (now - Date.parse(e.takenAt) <= days * DAY) return true;
    try { fs.rmSync(path.join(root(), e.file)); } catch {}
    removed.push(e.file);
    return false;
  });
  writeIndex(idx);
  // empty commit folders go too
  try { for (const d of fs.readdirSync(root(), { withFileTypes: true })) if (d.isDirectory() && !d.name.startsWith(".") && fs.readdirSync(path.join(root(), d.name)).length === 0) fs.rmdirSync(path.join(root(), d.name)); } catch {}
  return removed;
}

module.exports = { root, fileName, stampLines, validateEntry, readIndex, writeIndex, addEntry, find, gc, slug };
