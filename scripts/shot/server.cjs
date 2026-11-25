/**
 * The photographer's service (#2360): NOT an LLM — a small node daemon on 127.0.0.1:8096 holding one open Chrome.
 *   node scripts/shot/server.cjs            (launchd: scripts/shot/install-launchd.sh; `npm run shot` starts it itself when it is not up)
 * POST /shot {args, repo} → NDJSON: {"log":…}… then {"done":{files, entries}} or {"error":…}. One job at a time (a queue).
 * GET /health → {ok, pid, queue, chrome}
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { serveDist } = require("../../apps/mobile/e2e/serve.cjs");
const { parseArgs, expandAll, heightFor } = require("./args.cjs");
const { root, fileName, stampLines, addEntry, gc } = require("./index.cjs");
const { repoState, ensureBuild } = require("./build.cjs");
const { shootWeb, ShotError } = require("./web.cjs");
const { shootSim } = require("./sim.cjs");
const { stampPng } = require("./stamp.cjs");

const PORT = Number(process.env.GORIX_SHOT_PORT || 8096); // 8094–8099 are the photographer's; 8081/8082/8090 are taken
let browser = null;
const servers = new Map(); // build dir → { base, close }
let queued = 0;
let chain = Promise.resolve();

async function chrome() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
  browser.on("disconnected", () => { browser = null; });
  return browser;
}
async function baseFor(dir) {
  if (!servers.has(dir)) servers.set(dir, await serveDist(dir, 0));
  return servers.get(dir).base;
}

async function runJob(req, log) {
  const o = parseArgs(req.argv);
  const repo = o.repo || req.repo || process.cwd();
  const st = repoState(repo);
  const jobs = o.all ? expandAll(o) : [o];
  const files = [], entries = [];
  const needWeb = jobs.some((j) => j.engine === "web");
  let build = null;
  if (needWeb) build = await ensureBuild(st, log, { noBuild: o.noBuild });
  if (build && build.stale) log(`ВНИМАНИЕ: --no-build — снимаю с устаревшей сборки (не ${st.id})`);
  const br = await chrome();
  const base = build ? await baseFor(build.dir) : null;
  let n = 0;
  for (const j of jobs) {
    n++;
    if (jobs.length > 1) log(`[${n}/${jobs.length}] ${j.route} ${j.theme} ${j.state || ""}`);
    const shots = j.engine === "sim" ? await shootSim(j, log) : await shootWeb(br, base, j, log);
    for (const s of shots) {
      const e = { engine: j.engine, route: j.route, role: j.engine === "sim" ? "app" : j.role, theme: j.theme, width: j.width, height: j.engine === "web" ? heightFor(j.width) : null, lang: j.engine === "sim" ? "app" : j.lang, font: j.font, reduceMotion: j.reduceMotion, scroll: j.scroll, actions: j.actions.map((a) => a.type + (a.arg ? ":" + a.arg : "") + (a.value != null ? "=" + a.value : "")), state: j.state, crop: j.crop, frame: s.frame || null, commit: st.commit, dirty: st.dirty, build: build ? path.basename(build.dir) : null, branch: st.branch, takenAt: new Date().toISOString(), by: j.by, keep: !!j.keep, ref: false };
      e.file = path.join(st.commit + (st.dirty ? "+" : ""), fileName(e));
      e.id = e.file.replace(/\.png$/, "");
      e.stamp = stampLines(e).join(" | ");
      if (j.engine === "sim") e.note = "симулятор: сборка приложения на устройстве неизвестна, штамп — HEAD репозитория на момент снимка";
      const stamped = await stampPng(br, s.png, stampLines(e));
      const abs = path.join(root(), e.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, stamped);
      addEntry(e);
      files.push(abs); entries.push(e);
    }
  }
  gc(14);
  return { files, entries, rebuilt: !!(build && build.rebuilt), commit: st.commit + (st.dirty ? "+" : "") };
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true, pid: process.pid, queue: queued, chrome: !!(browser && browser.isConnected()) })); }
  if (req.method === "POST" && req.url === "/shot") {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => {
      let r; try { r = JSON.parse(body); } catch { res.writeHead(400); return res.end("bad json"); }
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      const send = (o) => res.write(JSON.stringify(o) + "\n");
      queued++;
      if (queued > 1) send({ log: `в очереди: впереди ${queued - 1}` });
      chain = chain.then(async () => {
        try { send({ done: await runJob(r, (m) => send({ log: m })) }); }
        catch (e) { send({ error: String(e.message || e), usage: !!e.usage }); }
        finally { queued--; res.end(); }
      });
    });
    return;
  }
  res.writeHead(404); res.end();
});
server.listen(PORT, "127.0.0.1", () => console.log(`photographer on 127.0.0.1:${PORT}, shots → ${root()}`));
process.on("SIGTERM", () => { server.close(); if (browser) browser.close(); process.exit(0); });
