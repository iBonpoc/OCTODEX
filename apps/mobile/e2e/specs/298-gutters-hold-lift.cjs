/**
 * e2e 298 — #1272 (founder 12.11: «не чувствую момента, когда можно тянуть»): a finger held still on a gutter's end for the long-press
 * time picks it up AT ONCE — the gutter becomes the picked one (its ring) before any move — and letting go without a move changes
 * nothing in the drawing. A quick drag from the same end with «Желоб» is still drawing. Every view. (The tick itself is a phone's:
 * the logic of what is picked is test/gutterLift.test.ts.)
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  // the WHOLE element (geom and attrs: the side L/R, the length, the colour…), not only the ends
  const runs = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => ({ id: e.id, geom: e.geom, attrs: e.attrs })), KEY);
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const center = (sel) => svg().locator(sel).evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const ay = b.y + b.height * 0.3, by = b.y + b.height * 0.6;
  await stroke([b.x + b.width * 0.1, ay], [b.x + b.width * 0.4, ay]); // A
  await stroke([b.x + b.width * 0.1, by], [b.x + b.width * 0.4, by]); // B — now B is the picked one
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === 2, KEY, { timeout: 8000 });
  const before = await runs();
  // the picked gutter has a halo under it (id halo-<run>)
  const selected = () => svg().locator("[id^=halo]").evaluateAll((ls) => ls.map((l) => l.id).join(","));
  const aEnd = (await center('[id^="cap:"]')).filter((c) => Math.abs(c[1] - ay) < 8).sort((u, v) => v[0] - u[0])[0];

  // held on A's right end — A is not the picked one yet; after the hold it is, with the finger still down and not moved
  const pickedBefore = await selected();
  await p.mouse.move(aEnd[0], aEnd[1]);
  await p.mouse.down();
  const t0 = await p.evaluate(() => performance.now());
  await p.waitForFunction((t) => performance.now() - t > 650, t0);
  await p.waitForFunction((prev) => { const now = [...document.querySelectorAll('[data-testid="draw-svg"] [id^=halo]')].map((l) => l.id).join(","); return !!now && now !== prev; }, pickedBefore, { timeout: 5000 });
  h.expect((await selected()) !== pickedBefore, "held on A's end: A is the picked one at once, before any move");
  // the point itself is lifted (bigger, with its ring) and the free ends it can stick to are marked — before any move
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] [id^="lift-cap:"]').length === 1, null, { timeout: 5000 });
  h.expect((await svg().locator('[id^="target-cap:"]').count()) === 2, "B's two free ends are marked as the places it can stick to");
  await p.mouse.up();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] [id^="lift-"]').length === 0, null, { timeout: 5000 });
  h.expect((await svg().locator('[id^="target-"]').count()) === 0, "let go: the marks are gone");

  // a quick drag from the same end with «Желоб» is still drawing: a new gutter from it
  await tid("draw-tool-line").getByRole("button").click();
  await stroke(aEnd, [aEnd[0], aEnd[1] + 60]);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === 3, KEY, { timeout: 8000 });
  // …and, all the way through, the two gutters are the same WHOLE: the release of the hold was not a tap that flips the cap's side
  // (checked after the later drawing, so a late flip would have been written by now)
  const after = await runs();
  for (const id of before.map((r) => r.id)) h.expect(JSON.stringify(after.find((r) => r.id === id)) === JSON.stringify(before.find((r) => r.id === id)), `gutter ${id.slice(0, 4)} is untouched (geom and attrs)`);
};
