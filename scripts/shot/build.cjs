/**
 * Builds of the web app for the photographer (#2360): one folder per (repo, commit[, uncommitted changes]).
 * «Fresh» = the build's id equals the repo's current id; otherwise the service says so and rebuilds — it never serves old pixels silently.
 */
const { execFileSync, spawn } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { root } = require("./index.cjs");

const git = (repo, ...a) => execFileSync("git", ["-C", repo, ...a], { encoding: "utf8", maxBuffer: 64 << 20 }).trim();

/** { toplevel, commit (short), branch, dirty, id } — id changes with the commit and with any change of tracked/untracked files */
function repoState(repo) {
  const toplevel = git(repo, "rev-parse", "--show-toplevel");
  const commit = git(toplevel, "rev-parse", "--short=7", "HEAD");
  const branch = git(toplevel, "rev-parse", "--abbrev-ref", "HEAD");
  // only what can change the picture: the app and the packages it builds from
  const scope = ["apps/mobile/src", "apps/mobile/assets", "apps/mobile/app.json", "apps/mobile/package.json", "packages"];
  const diff = git(toplevel, "diff", "HEAD", "--", ...scope);
  const untracked = git(toplevel, "ls-files", "--others", "--exclude-standard", "--", ...scope).split("\n").filter(Boolean)
    .map((f) => f + ":" + crypto.createHash("sha1").update(fs.readFileSync(path.join(toplevel, f))).digest("hex")).join("\n");
  const dirty = !!(diff || untracked);
  const sum = dirty ? crypto.createHash("sha1").update(diff + "\n" + untracked).digest("hex").slice(0, 6) : "";
  return { toplevel, commit, branch, dirty, id: commit + (dirty ? "-" + sum : "") };
}

const buildsDir = () => path.join(root(), ".builds");
const dirFor = (st) => path.join(buildsDir(), crypto.createHash("sha1").update(st.toplevel).digest("hex").slice(0, 6) + "-" + st.id);

/** returns { dir, rebuilt, was } — `log` receives progress lines */
async function ensureBuild(st, log, opts = {}) {
  const dir = dirFor(st);
  if (fs.existsSync(path.join(dir, "index.html"))) return { dir, rebuilt: false };
  const prefix = path.basename(dir).split("-")[0];
  const old = fs.existsSync(buildsDir()) ? fs.readdirSync(buildsDir()).filter((d) => d.startsWith(prefix + "-")) : [];
  if (opts.noBuild && old.length) return { dir: path.join(buildsDir(), old.sort().pop()), rebuilt: false, stale: true };
  log(`сборка устарела (${old.length ? "была " + old[old.length - 1].slice(prefix.length + 1) : "её нет"}, сейчас ${st.id}) — пересобираю, 1–3 минуты`);
  fs.mkdirSync(buildsDir(), { recursive: true });
  const tmp = dir + ".tmp";
  fs.rmSync(tmp, { recursive: true, force: true });
  await new Promise((resolve, reject) => {
    const p = spawn("npx", ["expo", "export", "--platform", "web", "--output-dir", tmp], { cwd: path.join(st.toplevel, "apps", "mobile"), env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    const keep = (b) => { tail = (tail + b).slice(-2000); };
    p.stdout.on("data", keep); p.stderr.on("data", keep);
    p.on("exit", (c) => (c === 0 ? resolve() : reject(new Error(`expo export упал (код ${c}):\n${tail}`))));
  });
  fs.renameSync(tmp, dir);
  // keep the three newest builds of this repo
  for (const d of old.sort().slice(0, Math.max(0, old.length - 2))) fs.rmSync(path.join(buildsDir(), d), { recursive: true, force: true });
  return { dir, rebuilt: true };
}

module.exports = { repoState, ensureBuild, dirFor };
