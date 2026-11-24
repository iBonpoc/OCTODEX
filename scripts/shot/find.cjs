/** `npm run shot:find -- client dark [--any] [--json]` — look in the index BEFORE asking the photographer (#2360). */
const { find } = require("./index.cjs");
const { repoState } = require("./build.cjs");
const path = require("node:path");
const { root } = require("./index.cjs");
const a = process.argv.slice(2);
const any = a.includes("--any"), json = a.includes("--json");
const words = a.filter((x) => !x.startsWith("--"));
let head = null; try { const s = repoState(process.cwd()); head = s.commit + (s.dirty ? "+" : ""); } catch {}
const hits = find(words);
if (json) { console.log(JSON.stringify(hits, null, 2)); process.exit(0); }
const fresh = hits.filter((e) => e.commit + (e.dirty ? "+" : "") === head);
const shown = any ? hits : fresh;
for (const e of shown.slice(0, 30)) console.log(`${path.join(root(), e.file)}   [${e.takenAt.slice(0, 16)} ${e.engine}]`);
if (!shown.length) console.log(`нет снимков для «${words.join(" ")}» на сборке ${head}${hits.length ? ` (есть ${hits.length} на старых — добавь --any)` : ""}. Запроси: npm run shot -- <маршрут> …`);
