/**
 * e2e 525 — #2434 (founder 23.11.2026, journal ~10:40), every view:
 * - the FIRST length window after a gutter is drawn: the feet typed over → the inches and the fraction go to 0 (the drawn ones
 *   were a guess); «Применить» keeps whole feet;
 * - the window opened again (its length label tapped): the inches set by hand → the feet typed over → the inches stay.
 */
const { settle } = require("../settle.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await settle(p, { quietMs: 100, maxMs: 600 }); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
  };
  const runs = () =>
    p.evaluate((k) => {
      const g = (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters;
      return g ? g.elements.filter((e) => e.kind === "run" && !e.deletedAt) : [];
    }, KEY);
  const field = (id) => tid(id).locator("input");
  /** the unit at the end of the number (#675): a tap → the menu at it → a unit; the menu goes, the field is there */
  const pickUnit = async (name) => {
    await tid("quick-length-unit").click();
    const item = p.getByRole("menuitem", { name, exact: true });
    await item.waitFor({ timeout: 3000 });
    await item.click();
    await item.waitFor({ state: "hidden", timeout: 3000 });
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Без срока/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  const x0 = b.x + b.width * 0.08;
  const x1 = b.x + b.width * 0.4;

  const fields = async () => ({ ft: await field("quick-length-ft").inputValue(), inc: await field("quick-length-in").inputValue(), frac: (await tid("quick-length-frac").count()) ? (await tid("quick-length-frac").first().innerText()).trim() : "" });

  // a gutter drawn: the window, the feet focused and selected
  await stroke([x0, y], [x1, y]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await waitFor(() => field("quick-length-ft").evaluate((el) => el === document.activeElement), "the feet field has the focus");
  const before = await fields();
  h.expect(Number(before.ft) > 0, `the drawn feet are there (${before.ft})`);
  // the feet typed over, digit by digit, as on a phone
  const newFt = String(Number(before.ft) + 3);
  await p.keyboard.type(newFt, { delay: 60 });
  await waitFor(async () => (await field("quick-length-ft").inputValue()) === newFt, `the feet are ${newFt}`);
  await settle(p); // the window has drawn what the feet changed
  const after = await fields();
  h.expect(after.inc === "0", `first window: the inches go to 0 (${before.inc} → ${after.inc})`);
  h.expect(after.frac === "", `first window: no fraction (${before.frac} → ${after.frac})`);
  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length").waitFor({ state: "hidden", timeout: 3000 });
  const whole = Number(newFt) * 12;
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === whole), `kept: ${newFt}′ 0″ (${JSON.stringify((await runs()).map((r) => r.geom?.lengthIn))})`);

  // again, from its length label: the inches typed, then the feet → the inches stay
  const lab = await p.getByTestId("draw-svg").first().locator('[id^="lbl-len:"]').filter({ hasText: `${newFt}′` }).first().boundingBox();
  await p.mouse.click(lab.x + lab.width / 2, lab.y + lab.height / 2);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await field("quick-length-in").fill("7");
  await field("quick-length-ft").fill(String(Number(newFt) + 1));
  await settle(p);
  h.expect((await field("quick-length-in").inputValue()) === "7", "opened again: the feet keep the inches");
  await tid("quick-length-apply").getByRole("button").click();
  await waitFor(async () => (await runs()).some((r) => r.geom?.lengthIn === (Number(newFt) + 1) * 12 + 7), `kept: ${Number(newFt) + 1}′ 7″`);
};
