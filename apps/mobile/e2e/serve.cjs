/**
 * Serves a built web app (dist/) on 127.0.0.1 with SPA fallback — for e2e/run.cjs (demo) and e2e/cloud/cloud.cjs
 * (against a local Supabase, docs/specs/21). serveDist(dir) → { base, close }.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".ttf": "font/ttf" };
function serveDist(DIST) {
  const server = http.createServer((req, res) => {
    let p = path.join(DIST, decodeURIComponent(req.url.split("?")[0]));
    if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, "index.html");
    res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

module.exports = { serveDist };
