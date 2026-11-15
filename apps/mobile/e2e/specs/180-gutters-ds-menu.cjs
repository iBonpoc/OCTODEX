/**
 * e2e 180 — меню водостока, цвет «как у желоба», этажи, ручка панели (просьба основателя 09.11;
 * docs/specs/33-gutters-canvas.md П20.17). Every view.
 * - over the $: «Примерная смета по замеру»;
 * - a 2nd storey gutter and a 3rd storey one from its end: no corner, a cap at each end (four);
 * - a downspout put → its menu opens by itself; size and colour are folded rows; the colour is «Как у желоба»;
 *   the gutter turns black → the downspout's colour follows; «Без покраски» is one of the colours (no painted/bare pair);
 * - offsets: 1, then 3″, then its own 2½″;
 * - the grip: while dragged it says where to let go.
 * Finds things by testID / id; waits on what it checks.
 */
const { openProps, skipLength, canvasAt } = require("../gutters.cjs");
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
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
    await p.waitForTimeout(200);
  };
  const els = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt), KEY);
  const panel = () => tid("attr-panel");
  const pickIn = async (field, name) => {
    if (!(await tid(field).getByRole("radio").count())) await tid(`${field}-open`).click();
    await tid(field).getByRole("radio", { name, exact: true }).click();
  };
  const closePanel = async () => {
    if (wide) await tid("draw-panel-close").getByRole("button").click();
    else await p.getByRole("button", { name: "Закрыть", exact: true }).first().click({ position: { x: 10, y: 10 } });
    await waitFor(async () => (await panel().count()) === 0, "the menu is closed");
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  h.expect((await tid("draw-money").count()) === 0, "no total under the drawing (#700)");
  const b = await p.getByTestId("draw-surface").boundingBox();
  const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.4;
  const y0 = b.y + b.height * 0.3, y1 = b.y + b.height * 0.5;

  // storey 2, then storey 3 from its end: they do not meet
  await tid("draw-story").getByRole("button").click(); // 1 → 2
  await stroke([x0, y1], [x0, y0]);
  // nothing picked: «Этаж» changes only the next gutter — the tap on the canvas, not on the leaving length sheet (GitHub
  // 09.11, #481: it landed on the sheet, the gutter stayed picked and went to the 3rd storey with the next one)
  const empty = [b.x + b.width * 0.8, b.y + b.height * 0.42]; // an empty place of the canvas, clear of the header
  await canvasAt(p, empty[0], empty[1]);
  await p.mouse.click(empty[0], empty[1]);
  await waitFor(async () => (await tid("draw-selected").count()) === 0, "nothing picked");
  await tid("draw-story").getByRole("button").click(); // 2 → 3
  await stroke([x0, y0], [x1, y0]);
  await waitFor(async () => (await els()).filter((e) => e.kind === "run").length === 2, "two gutters");
  h.expect((await svg().locator('[id^="c:"]').count()) === 0, "a 2nd and a 3rd storey gutter make no corner");
  h.expect((await svg().locator('[id^="cap:"]').count()) === 4, "a cap at each of the four ends");

  // a downspout on the 2nd storey gutter: its menu opens by itself
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click(x0 + 2, (y0 + y1) / 2);
  await panel().waitFor({ timeout: 5000 });
  await tid("attr-ds-size").waitFor({ timeout: 3000 });
  h.expect((await tid("attr-ds-size-value").count()) === 1 && (await tid("attr-color-value").count()) === 1, "size and colour are folded rows");
  h.expect(/^Как у желоба/.test(await tid("attr-color-value").innerText()), "the colour: «Как у желоба»");
  h.expect((await tid("attr-finish").count()) === 0, "no painted / bare pair");

  // the length is a dropdown now (#1276: size, colour and length are folded rows): «по этажу» by default, a number of feet on a pick, back to «по этажу»
  h.expect((await tid("attr-ds-length-value").count()) === 1 && /^По этажу/.test(await tid("attr-ds-length-value").innerText()), "the length: a folded row, «По этажу» by default");
  await tid("attr-ds-length-open").click();
  await p.getByRole("button", { name: "20′", exact: true }).or(p.getByText("20′", { exact: true })).last().click();
  await waitFor(async () => (await els()).find((e) => e.kind === "downspout")?.attrs.heightIn === 240, "20′ picked: the downspout's own height is 240″");
  await tid("attr-ds-length-open").click();
  await p.getByText("По этажу", { exact: true }).last().click();
  await waitFor(async () => (await els()).find((e) => e.kind === "downspout")?.attrs.heightIn === undefined, "«По этажу»: no own height");

  // offsets: 1, then 3″, then its own 2½″
  await tid("attr-offset-qty").getByRole("button", { name: /\+1$/ }).click();
  await tid("attr-offset-len").getByRole("radio", { name: "3″", exact: true }).click();
  await waitFor(async () => JSON.stringify((await els()).find((e) => e.kind === "downspout")?.attrs.offsets) === JSON.stringify([{ lengthIn: 3, qty: 1 }]), "one 3″ offset");
  await tid("attr-offset-len").getByRole("radio", { name: "Свой", exact: true }).click();
  await tid("attr-offset-own").locator("input").fill("2.5");
  await tid("attr-offset-own-apply").getByRole("button").click();
  await waitFor(async () => JSON.stringify((await els()).find((e) => e.kind === "downspout")?.attrs.offsets) === JSON.stringify([{ lengthIn: 2.5, qty: 1 }]), "its own 2½″ offset");
  await h.shot("ds-menu");
  await closePanel();

  // the gutter turns black → the downspout follows
  await tid("draw-tool-line").getByRole("button").click(); // a tap picks with any tool but «Водосток» (#687)
  await p.mouse.click(x0 + 1, y1 - (y1 - y0) * 0.15);
  if (!wide) await openProps(p);
  await panel().waitFor({ timeout: 5000 });
  await pickIn("attr-color", "Чёрный");
  await waitFor(async () => (await els()).find((e) => e.kind === "downspout")?.attrs.color === "black", "the downspout follows its gutter: black");
  // «Без покраски» is a colour
  await pickIn("attr-color", "Без покраски");
  await waitFor(async () => (await els()).find((e) => e.kind === "run" && e.attrs.story === 2)?.attrs.finish === "mill", "«Без покраски» → the gutter is bare");
  await closePanel();

  // the grip: while dragged it says where to let go
  const g = await tid("draw-grip").boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 6; i++) await p.mouse.move(g.x + g.width / 2 + i * 6, g.y + g.height / 2 - i * 8);
  await tid("draw-grip-hint").waitFor({ timeout: 3000 });
  await p.mouse.up();
  await waitFor(async () => (await tid("draw-grip-hint").count()) === 0, "the hint goes once let go");
};
