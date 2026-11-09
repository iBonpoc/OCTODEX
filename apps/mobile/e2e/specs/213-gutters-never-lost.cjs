/**
 * e2e 213 — чертёж не теряется (страх основателя 09.11, версия 475: «отвлёкся, смахнул приложение, обновилось — чертёж
 * пропал»; docs/specs/33-gutters-canvas.md П20.21). Every view.
 * - «Замерить здесь» without a client: three gutters drawn one after another, the page reloaded AT ONCE (no pause after
 *   the last stroke) → the same three on the canvas, and in the phone's copy of the data;
 * - one more, then the app left at once (another page — pagehide) and the measurement opened by its address → four.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const lines = () => svg().locator("line:not([id^=halo])").count();
  const stored = () =>
    p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length, KEY);
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 8, a[1] + ((b[1] - a[1]) * i) / 8);
    await p.mouse.up();
    await skipLength(p);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => (await tid("module-gutters-status").count()) === 1, "the module's status");
  // «Замерить здесь» — no client, no lead
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.45;
  for (const f of [0.2, 0.35, 0.5]) await stroke([x0, b.y + b.height * f], [x1, b.y + b.height * f]);
  await waitFor(async () => (await lines()) === 3, "three gutters drawn");

  // reloaded at once — the phone killed the app, an update came
  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await lines()) === 3, `after a reload at once: the same three gutters on the canvas (${await lines()})`);
  h.expect((await stored()) === 3, `…and in the phone's copy of the data (${await stored()})`);

  // one more, then the app left at once
  await stroke([x0, b.y + b.height * 0.65], [x1, b.y + b.height * 0.65]);
  await waitFor(async () => (await lines()) === 4, "a fourth");
  const here = new URL(p.url());
  h.expect(!!here.searchParams.get("m"), `the address names the measurement (${here.search})`);
  await h.go("/"); // another page at once: the app is left
  await h.go(here.pathname + here.search);
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await stored()) === 4, `left at once and back: four in the phone's copy (${await stored()})`);
  await waitFor(async () => (await lines()) === 4, "…and on the canvas");
};
