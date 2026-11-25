/**
 * Pixel «до / после» for a refactor that must not change the look (Ш III, спека 63 §3а): node scripts/pixelDiff.cjs <dirBefore> <dirAfter>
 * Compares every layout-*.png of the two e2e/out folders (08-layouts) byte for byte of the decoded pixels; exit 1 on any difference.
 * Uses pngjs (already in the tree through Playwright's tools; not a new dependency of the app).
 */
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const [a, b] = process.argv.slice(2);
const names = fs.readdirSync(a).filter((f) => /^layout-.*\.png$/.test(f)).sort();
let bad = 0;
for (const n of names) {
  if (!fs.existsSync(path.join(b, n))) { console.log(`missing after: ${n}`); bad++; continue; }
  const x = PNG.sync.read(fs.readFileSync(path.join(a, n)));
  const y = PNG.sync.read(fs.readFileSync(path.join(b, n)));
  if (x.width !== y.width || x.height !== y.height) { console.log(`size differs: ${n}`); bad++; continue; }
  let d = 0;
  for (let i = 0; i < x.data.length; i += 4) if (x.data[i] !== y.data[i] || x.data[i + 1] !== y.data[i + 1] || x.data[i + 2] !== y.data[i + 2] || x.data[i + 3] !== y.data[i + 3]) d++;
  if (d) { console.log(`${n}: ${d} px differ`); bad++; }
}
console.log(`${names.length} screens compared, ${bad} differ`);
process.exit(bad ? 1 : 0);
