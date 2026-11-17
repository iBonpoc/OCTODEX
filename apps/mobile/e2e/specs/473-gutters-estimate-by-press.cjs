/**
 * e2e 473 — the estimate from a measurement is made only by a press. Every view.
 * A link to «Просмотр замера» with estimate=1 (the lead's «Смета из замера», an estimate's «Обновить из замера») opens the review and
 * ASKS: no estimate is made or changed by opening it; «Сделать смету» in the question makes it. Finds things by testID and the store.
 */
const { skipLength, savedOnce } = require("../gutters.cjs");
const { settle } = require("../settle.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const ofM = (l, mid) => l.source && l.source.module === "gutters" && l.source.measurementId === mid;
  const estimatesOf = async (mid) => ((await db())?.estimates ?? []).filter((e) => (e.doc?.options ?? []).some((o) => o.lines.some((l) => ofM(l, mid))));

  await h.go("/today");
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, DB_KEY, { timeout: 8000 });

  // a lead's measurement with one run
  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-measure").getByRole("button").click();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4;
  await p.mouse.move(b.x + b.width * 0.25, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.25 + (0.45 * i) / 12), y);
  await p.mouse.up();
  await skipLength(p);
  await savedOnce(p);
  await p.waitForFunction(() => !!new URL(location.href).searchParams.get("m"), null, { timeout: 8000 });
  const mid = new URL(p.url()).searchParams.get("m");

  // the link with estimate=1: the review opens and asks; nothing is made by opening it
  await h.go(`/module/gutters/view?m=${encodeURIComponent(mid)}&estimate=1`);
  await tid("view-estimate-ask").waitFor({ timeout: 8000 });
  await settle(p, { quietMs: 600, maxMs: 3000 }); // the page quiet and «leaving» (pagehide): whatever was to be written is written
  h.expect(!/\/estimate\//.test(p.url()), "still on the review: no estimate editor opened by itself");
  h.expect((await estimatesOf(mid)).length === 0, "opening the link made no estimate");
  await h.shot("ask");
  // the same link on the canvas (an old one) goes to the review and asks the same
  await h.go(`/module/gutters/draw?m=${encodeURIComponent(mid)}&estimate=1`);
  await tid("view-estimate-ask").waitFor({ timeout: 8000 });
  h.expect((await estimatesOf(mid)).length === 0, "the old canvas link made no estimate either");

  // the press makes it
  await tid("view-estimate-ask-action").getByRole("button").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  await p.waitForFunction(([k, m]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.estimates ?? []).some((e) => (e.doc?.options ?? []).some((o) => o.lines.some((l) => l.source && l.source.measurementId === m))), [DB_KEY, mid], { timeout: 8000 });
};
