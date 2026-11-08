/**
 * e2e 170 — водосток на холсте и продолжение линии (просьба основателя 08.11; docs/specs/33-gutters-canvas.md П20.11).
 * Every view.
 * - a downspout put on a gutter: «D1» inside its mark; over it the fittings in one word (default 3 × A → «AAA»);
 * - elbows by style in the panel: B +1 → «AAAB», A −1 → «AAB»;
 * - dragged by the finger, it slides along its run (the store's atIn changes, it stays on the run);
 * - «Выбрать», a long press on a free end, then a drag → a new gutter from that end (a corner), not a moved end.
 * Finds things by id / testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const drag = async (a, b, holdMs = 0) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    if (holdMs) await p.waitForTimeout(holdMs);
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
    await p.waitForTimeout(200);
  };
  const texts = () => svg().locator("text").evaluateAll((ts) => ts.map((t) => (t.textContent || "").trim()));
  const g = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || [], KEY);
  const live = async (kind) => (await g()).filter((e) => e.kind === kind && !e.deletedAt);
  const step = async (style, sign) => {
    await tid(`attr-elbow-${style}`).getByRole("button", { name: new RegExp(`^${style} ${sign === 1 ? "\\+" : "−"}1$`) }).click();
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  const x0 = b.x + b.width * 0.12, x1 = b.x + b.width * 0.5;
  await drag([x0, y], [x1, y]);
  await waitFor(async () => (await live("run")).length === 1, "one gutter");

  // a downspout: «D1» inside, «AAA» over it
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click(x0 + (x1 - x0) * 0.3, y + 2);
  await waitFor(async () => (await svg().locator("circle").count()) === 1, "a downspout mark");
  await waitFor(async () => (await texts()).includes("D1"), "«D1» inside the mark");
  await waitFor(async () => (await texts()).includes("AAA"), "the default fittings over it: «AAA»");

  // elbows by style
  if (!wide) await tid("draw-props").getByRole("button").click();
  await tid("attr-elbow-qty").waitFor({ timeout: 5000 });
  await step("B", 1);
  await waitFor(async () => (await texts()).includes("AAAB"), "B +1 → «AAAB»");
  await step("A", -1);
  await waitFor(async () => (await texts()).includes("AAB"), "A −1 → «AAB»");
  await waitFor(async () => {
    const ds = (await live("downspout"))[0];
    return JSON.stringify(ds?.attrs?.elbows) === JSON.stringify([{ style: "A", qty: 2 }, { style: "B", qty: 1 }]);
  }, "the store: A 2, B 1");
  await h.shot("ds");
  if (!wide) await p.getByRole("button", { name: "Закрыть", exact: true }).first().click({ position: { x: 10, y: 10 } });
  else await tid("draw-panel-close").getByRole("button").click();

  // drag the downspout along its run
  const at0 = (await live("downspout"))[0].geom.atIn;
  const mark = await svg().locator("circle").first().boundingBox();
  const c = [mark.x + mark.width / 2, mark.y + mark.height / 2];
  await drag(c, [x0 + (x1 - x0) * 0.8, y + 20]);
  await waitFor(async () => (await live("downspout"))[0].geom.atIn > at0 + 12, "dragged: further along the run");
  h.expect((await live("run")).length === 1, "dragging a downspout draws no line");
  const mark2 = await svg().locator("circle").first().boundingBox();
  h.expect(Math.abs(mark2.y + mark2.height / 2 - y) < 6, "it stays on the run (not where the finger went)");

  // «Выбрать»: a long press on the free right end, then a drag → a new gutter from it
  await tid("draw-tool-select").getByRole("button").click();
  await drag([x1, y], [x1, y + b.height * 0.25], 600);
  await waitFor(async () => (await live("run")).length === 2, "a long press on an end: a new gutter from it");
  await waitFor(async () => (await svg().locator('[id^="c:"]').count()) === 1, "a corner where it starts");
};
