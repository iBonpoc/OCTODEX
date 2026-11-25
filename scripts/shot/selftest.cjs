/** `npm run shot:selftest` (#2360): the service answers, one real shot lands with its stamp and an index entry; the simulator is checked when booted. */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { ensureService, request } = require("./client.cjs");
const { readIndex, validateEntry, root } = require("./index.cjs");
const ok = (c, m) => { if (!c) { console.error("✗ " + m); process.exit(1); } console.log("✓ " + m); };
(async () => {
  await ensureService();
  const h = JSON.parse(await request("GET", "/health"));
  ok(h.ok, `служба отвечает (pid ${h.pid})`);
  const out = execFileSync("node", [path.join(__dirname, "client.cjs"), "/today", "--theme", "light", "--width", "390", "--state", "selftest", "--by", "selftest"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], timeout: 600000 }).trim().split("\n");
  const file = out[out.length - 1];
  ok(fs.existsSync(file), `снимок лёг: ${file}`);
  const png = fs.readFileSync(file);
  const h2 = png.readUInt32BE(20);
  ok(h2 === 844 + 34, `высота ${h2} = 844 + полоса штампа 34`);
  const e = readIndex().shots.find((x) => path.join(root(), x.file) === file);
  ok(!!e && validateEntry(e).length === 0, "запись в index.json верна");
  ok(path.basename(file).includes(e.commit), "штамп (коммит) есть в имени файла");
  console.log("selftest: OK");
})().catch((e) => { console.error("✗ " + e.message); process.exit(1); });
