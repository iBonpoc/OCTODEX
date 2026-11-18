/**
 * e2e 392 — #1570 (founder 14.11: «если я удалил водосток откуда-то, чтобы оно мне писало уведомление, что не хватает водостока»).
 * A gutter gets its downspout by itself; the person takes it off — a warning stays on the canvas («Не хватает водостока», which gutter,
 * how many it needs) until it is put back; «Поставить водосток» puts it back (automatic, the same rule) and the warning goes. Every view.
 * Finds things by testID / stored elements; waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.autoDs = true; // about the automatic downspouts (the runner switches them off for the others)

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const els = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt), KEY);
  const dsCount = (n, what) => p.waitForFunction(([k, want]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "downspout").length === want, [KEY, n], { timeout: 8000 }).catch(async () => h.expect(false, `${what}: ${JSON.stringify((await els()).filter((e) => e.kind === "downspout").map((e) => e.geom))}`));
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();

  // a gutter with its downspout, by itself; nothing is short
  const y = b.y + b.height * 0.35;
  await stroke([b.x + b.width * 0.15, y], [b.x + b.width * 0.55, y]);
  await dsCount(1, "a new gutter has its downspout");
  h.expect((await p.getByTestId("draw-ds-short").count()) === 0, "nothing is short: no warning");

  // the person takes the downspout off (the tool «Желоб»: one tap picks it, no menu; the bin)
  await tid("draw-tool-line").getByRole("button").click();
  const mark = (await svg().locator("circle").evaluateAll((cs) => cs.map((c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })))[0];
  await p.mouse.click(mark[0], mark[1]);
  await tid("draw-delete").getByRole("button").click();
  await dsCount(0, "the downspout is taken off");

  // the warning stays on the canvas: which gutter, it needs 1, has 0
  const warn = tid("draw-ds-short");
  await warn.waitFor({ timeout: 5000 });
  const text = await warn.innerText();
  h.expect(/0\D+1/.test(text), `the warning says how many stand of how many it needs («0 из 1») (${JSON.stringify(text)})`);
  await h.shot("ds-short");

  // «Поставить водосток»: the downspout is back (automatic), the warning is gone
  await tid("draw-ds-short-action").getByRole("button").click();
  await dsCount(1, "«Поставить downspout» puts the downspout back");
  await p.getByTestId("draw-ds-short").first().waitFor({ state: "detached", timeout: 5000 });
  const back = (await els()).find((e) => e.kind === "downspout");
  h.expect(back.attrs.auto === true, "the downspout put back is automatic (the same rule)");
};
