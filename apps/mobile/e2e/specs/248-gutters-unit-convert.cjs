/**
 * e2e 248 — #922: a unit picked in «Длина желоба» shows the SAME length (it was reset to the drawn one). Every view.
 * - 41′ 1″ typed → «м» → 12.522 → «фут + дюйм» → 41′ 1″ again (no loss);
 * - → «мм» → 12522 → «дюймы» → 493;
 * - «Применить» after the round trip, edited nowhere → the gutter is 493″ in the store.
 * Finds things by testID; waits on what it checks.
 */
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

  await field("quick-length-ft").fill("41");
  await field("quick-length-in").fill("1");
  await pickUnit("м");
  await waitFor(async () => (await field("quick-length-one").inputValue()) === "12.522", "41′ 1″ in metres: 12.522");
  await pickUnit("фут + дюйм");
  await waitFor(async () => (await field("quick-length-ft").inputValue()) === "41" && (await field("quick-length-in").inputValue()) === "1", "…and back: 41′ 1″");
  await pickUnit("мм");
  await waitFor(async () => (await field("quick-length-one").inputValue()) === "12522", "in millimetres: 12522");
  await pickUnit("дюймы");
  await waitFor(async () => (await field("quick-length-one").inputValue()) === "493", "in inches: 493");

  // a wrong number typed, then another unit: the length it had comes back — and it says so
  await field("quick-length-one").fill("abc");
  await pickUnit("м");
  await tid("quick-length-bad").waitFor({ timeout: 3000 });
  await waitFor(async () => (await field("quick-length-one").inputValue()) === "12.522", "the length it had: 12.522 m");
  await pickUnit("дюймы");
  await waitFor(async () => (await tid("quick-length-bad").count()) === 0, "a good unit switch clears the warning");

  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length").waitFor({ state: "detached", timeout: 5000 });
  await waitFor(async () => (await p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom.lengthIn), KEY)).includes(493), "the gutter is 493″ in the store");
};
