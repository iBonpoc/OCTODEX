/**
 * e2e 251 — #504 (founder 11.11): a free end cap is taken by a long press and pulled along its gutter. Every view.
 * - the picked gutter's two free ends have a handle ring;
 * - (the downspout tool; «Желоб» goes on with a new gutter from an end) a long press on an end cap, then a pull outward → the gutter is longer, the other end stays, the face is not turned;
 * - with the downspout tool the same on the other end, pulled inward → shorter; «Назад» puts the length back;
 * - «Желоб»: along the gutter = a pull (above), across it = a new gutter from the end (decided on the first move).
 * Finds things by testID / id; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
  };
  const field = (id) => tid(id).locator("input");
  const pickUnit = async (name) => {
    await tid("quick-length-unit").click();
    const item = p.getByRole("menuitem", { name, exact: true });
    await item.waitFor({ timeout: 3000 });
    await item.click();
    await item.waitFor({ state: "hidden", timeout: 3000 });
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  await stroke([b.x + b.width * 0.08, y], [b.x + b.width * 0.4, y]);
  await tid("quick-length").waitFor({ timeout: 5000 });

  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length").waitFor({ state: "detached", timeout: 5000 });
  const geom = async () => (await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom), KEY))[0];
  const len = (g) => Math.hypot(g.b[0] - g.a[0], g.b[1] - g.a[1]);
  const svg = () => p.getByTestId("draw-svg").first();
  await waitFor(async () => (await svg().locator('[id^="handle-cap:"]').count()) === 2, "the picked gutter's two free ends have a handle");
  await waitFor(async () => !!(await geom()), "the gutter is stored");
  const g0 = await geom();
  const L0 = len(g0);
  const capAt = async (i) => {
    const caps = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
    return caps.sort((a, c) => a[0] - c[0])[i];
  };
  const labelText = async () => (await svg().locator("text").allTextContents()).filter((x) => /′|″/.test(x)).join("|");
  let midLabel = "";
  const pull = async (at, dx, dy = 0, hold = 650) => {
    await p.mouse.move(at[0], at[1]);
    await p.mouse.down();
    if (hold) await p.waitForTimeout(hold); // held: longer than the long-press time
    for (let i = 1; i <= 8; i++) await p.mouse.move(at[0] + (dx * i) / 8, at[1] + (dy * i) / 8);
    await p.waitForTimeout(250);
    midLabel = await labelText(); // the finger is still down
    await p.mouse.up();
    await skipLength(p); // «Желоб»: a pull out straight opens the length window, as growing a gutter always did
  };
  const gutters2 = async () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom), KEY);
  const count = async () => (await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length, KEY));
  // «Желоб» (the tool it is in): a long press on the right end and a pull ALONG the gutter pulls the end
  const label0 = await labelText();
  await pull(await capAt(1), 80);
  h.expect(midLabel !== label0, `the length label changes while the finger is still down (${label0} → ${midLabel})`);
  await waitFor(async () => len(await geom()) > L0 + 1, "a long press on the cap and a pull out: the gutter is longer");
  const g1 = await geom();
  h.expect(g1.a[0] === g0.a[0] && g1.a[1] === g0.a[1], "the other end stays");
  h.expect(g1.houseSide === g0.houseSide, `the face is not turned (${g0.houseSide} → ${g1.houseSide})`);
  // the left end pulled in
  const L1 = len(g1);
  await p.waitForTimeout(300);
  // the downspout tool: the same, pulled in at the left end
  await tid("draw-tool-ds").getByRole("button").click();
  await pull(await capAt(0), 40);
  await waitFor(async () => len(await geom()) < L1 - 1, "the left end pulled in: shorter");
  // «Назад»: the length before the last pull
  await tid("draw-undo").getByRole("button").click();
  await waitFor(async () => Math.abs(len(await geom()) - L1) < 1.5, "«Назад» puts the length back");
  // «Желоб» again: a long press on the right end and a pull ACROSS the gutter is a new gutter from the end, as before
  await tid("draw-tool-line").getByRole("button").click();
  await p.waitForTimeout(300);
  // the picked gutter's handle with «Желоб», NO hold: along = a pull, across = a new gutter
  const c0 = await capAt(0), c1 = await capAt(1);
  await p.mouse.click((c0[0] + c1[0]) / 2, (c0[1] + c1[1]) / 2); // pick the gutter (its handles show)
  await waitFor(async () => (await svg().locator('[id^="handle-cap:"]').count()) === 2, "picked again: its handles");
  const before = len(await geom());
  await pull(await capAt(1), -60, 0, 0);
  await waitFor(async () => len((await gutters2())[0]) !== before, "the handle, no hold, along the gutter: pulled");
  // «Желоб», a long press on the cap, then ACROSS: the end is taken (director 12.11) — it swings, no new gutter (e2e 292 has the angle)
  await pull(await capAt(1), 0, 90);
  await waitFor(async () => { const g = await gutters2(); return g.length === 1 && Math.abs(g[0].b[1] - g[0].a[1]) > 5; }, "a long press then across with «Желоб»: the end swings, it is still one gutter");
  await tid("draw-undo").getByRole("button").click();
  await waitFor(async () => { const g = await gutters2(); return g.length === 1 && Math.abs(g[0].b[1] - g[0].a[1]) < 1; }, "«Назад»: straight again");
  // «Желоб», the picked gutter's ring, NO hold, ACROSS: a new gutter from the end, as before (#504) — drawing on from an end is what «Желоб» does
  {
    const r0 = await capAt(0), r1 = await capAt(1);
    await p.mouse.click((r0[0] + r1[0]) / 2, (r0[1] + r1[1]) / 2); // pick it (the swing above was undone: it may be let go)
    await waitFor(async () => (await svg().locator('[id^="handle-cap:"]').count()) === 2, "the gutter is picked: the ring is there");
  }
  await pull(await capAt(1), 0, 90, 0);
  await waitFor(async () => (await count()) === 2, "the ring, no hold, across: a new gutter from the end");
};
