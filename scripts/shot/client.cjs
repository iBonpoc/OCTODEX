/** `npm run shot -- …` (#2360): sends the request to the service (starting it when it is not up), prints the file paths. */
const http = require("node:http");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const PORT = Number(process.env.GORIX_SHOT_PORT || 8096);

function request(method, p, body, onLine) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PORT, method, path: p, headers: { "content-type": "application/json" } }, (res) => {
      let buf = "", all = "";
      res.on("data", (c) => { all += c; buf += c; let i; while ((i = buf.indexOf("\n")) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l && onLine) onLine(JSON.parse(l)); } });
      res.on("end", () => resolve(all));
    });
    r.on("error", reject); if (body) r.write(JSON.stringify(body)); r.end();
  });
}
async function up() { try { await request("GET", "/health"); return true; } catch { return false; } }
async function ensureService() {
  if (await up()) return;
  const dir = path.join(os.homedir(), "GoRix", "notes", "screens"); fs.mkdirSync(dir, { recursive: true });
  const out = fs.openSync(path.join(dir, ".service.log"), "a");
  console.error("фотограф не запущен — запускаю (launchd: npm run shot:install)");
  spawn(process.execPath, [path.join(__dirname, "server.cjs")], { detached: true, stdio: ["ignore", out, out] }).unref();
  for (let i = 0; i < 40; i++) { if (await up()) return; await new Promise((r) => setTimeout(r, 250)); }
  throw new Error("служба фотографа не поднялась, см. ~/GoRix/notes/screens/.service.log");
}

async function main() {
  const argv = process.argv.slice(2);
  // validate here too: a typo is answered at once, without waking the service
  const { parseArgs } = require("./args.cjs");
  try { parseArgs(argv); } catch (e) { console.error("ошибка: " + e.message); process.exit(2); }
  let repo; try { repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim(); } catch { repo = process.cwd(); }
  await ensureService();
  let result = null, failed = null;
  await request("POST", "/shot", { argv, repo }, (m) => { if (m.log) console.error(m.log); if (m.done) result = m.done; if (m.error) failed = m; });
  if (failed) { console.error("ошибка: " + failed.error); process.exit(failed.usage ? 2 : 1); }
  if (!result) { console.error("служба оборвала ответ"); process.exit(1); }
  for (const f of result.files) console.log(f);
  console.error(`готово: ${result.files.length} файл(ов), сборка ${result.commit}${result.rebuilt ? " (пересобрана)" : ""}`);
}
if (require.main === module) main().catch((e) => { console.error("ошибка: " + e.message); process.exit(1); });
module.exports = { request, up, ensureService };
