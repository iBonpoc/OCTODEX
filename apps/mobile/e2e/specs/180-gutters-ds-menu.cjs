/**
 * e2e 180 — меню водостока, цвет «как у желоба», этажи, ручка панели (просьба основателя 09.11;
 * docs/specs/33-gutters-canvas.md П20.17). Every view.
 * - over the $: «Примерная смета по замеру»;
 * - a 2nd storey gutter and a 3rd storey one from its end: no corner, a cap at each end (four);
 * - a downspout put → its menu opens by itself; size and colour are fields (#2412 G1; the colour under «Ещё»); the colour is «Как у желоба»;
 *   the gutter turns black → the downspout's colour follows; «Без покраски» is one of the colours (no painted/bare pair);
 * - offsets: 1, then 4″ (the stocked ones are 1, 2, 4″), then its own 2½″ (read at once, no «Применить»; «Свой» is read whole on every width);
 * - the grip: while dragged it says where to let go.
 * Finds things by testID / id; waits on what it checks.
 */
const { openProps, skipLength, canvasAt, pickAttr, attrShown, openAttrMore, winSave } = require("../gutters.cjs");
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
  const pickIn = (field, key) => pickAttr(p, field, key);
  const closePanel = async () => {
    await winSave(p); // the window's own «Сохранить» (DS §7.3, #2412 PR3): its edits kept
    await waitFor(async () => (await panel().count()) === 0, "the menu is closed");
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Без срока/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
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
  h.expect((await tid("attr-ds-size-button").count()) === 1, "the size is a field");
  await openAttrMore(p); // the colour, material, wall, length (#2412 G1)
  h.expect((await tid("attr-color-button").count()) === 1, "the colour is a field");
  h.expect(/^Как у gutter/.test(await attrShown(p, "attr-color")), "the colour: «Как у gutter»");
  h.expect((await tid("attr-finish").count()) === 0, "no painted / bare pair");

  // a size of its own (founder 27.11, #2981): «Свой» last in the size field, whole inches typed under it; a bad one is said, not written
  await pickIn("attr-ds-size", "@own");
  const ownSize = tid("attr-ds-size-own").locator("input");
  await ownSize.fill("3.5x5");
  await tid("attr-ds-size-own-bad").waitFor({ timeout: 3000 });
  h.expect((await els()).find((e) => e.kind === "downspout")?.attrs.size === "2x3", "3.5x5: said, not written");
  await ownSize.fill("3x5");
  await waitFor(async () => (await els()).find((e) => e.kind === "downspout")?.attrs.size === "3x5", "3x5 typed: the downspout is 3x5");
  h.expect((await tid("attr-ds-size-own-bad").count()) === 0, "a good size: no warning");
  await pickIn("attr-ds-size", "2x3");
  await waitFor(async () => (await els()).find((e) => e.kind === "downspout")?.attrs.size === "2x3", "back to 2x3 from the list");
  h.expect((await tid("attr-ds-size-own").count()) === 0, "a size of the list: the own field shut");

  // its own height (#1276; founder 27.11, #2985: «зачем для этого селектор»): a number of feet, empty — by the storey
  const own = tid("attr-ds-length").locator("input");
  h.expect((await tid("attr-ds-length-button").count()) === 0 && (await own.inputValue()) === "", "the own height: a number field, empty (by the storey)");
  await own.fill("20");
  await waitFor(async () => (await els()).find((e) => e.kind === "downspout")?.attrs.heightIn === 240, "20 ft typed: the downspout's own height is 240″");
  await own.fill("500");
  await tid("attr-ds-length-bad").waitFor({ timeout: 3000 });
  h.expect((await els()).find((e) => e.kind === "downspout")?.attrs.heightIn === 240, "500 ft: said, not written");
  await own.fill("");
  await waitFor(async () => (await els()).find((e) => e.kind === "downspout")?.attrs.heightIn === undefined, "emptied: by the storey, no own height");

  // offsets: 1, then 4″ (the menu has the stocked 1, 2, 4″ — «Расход v2» Н4 — and «Свой»), then its own 2½″
  await tid("attr-offset-qty").getByRole("button", { name: /\+1$/ }).click();
  await pickIn("attr-offset-len", "4");
  await waitFor(async () => JSON.stringify((await els()).find((e) => e.kind === "downspout")?.attrs.offsets) === JSON.stringify([{ lengthIn: 4, qty: 1 }]), "one 4″ offset");
  await pickIn("attr-offset-len", "own");
  await tid("attr-offset-own").locator("input").fill("2.5");
  const ownCut = await p.evaluate(() => [...document.querySelectorAll('[data-testid="attr-offset-len-button"]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => [b, ...b.querySelectorAll("*")].some((n) => n.scrollWidth > n.clientWidth + 1)));
  h.expect(ownCut.length >= 1 && !ownCut.some(Boolean), "«Свой» is read whole in the value field (K2 #2662)");
  await waitFor(async () => JSON.stringify((await els()).find((e) => e.kind === "downspout")?.attrs.offsets) === JSON.stringify([{ lengthIn: 2.5, qty: 1 }]), "its own 2½″ offset");
  await h.shot("ds-menu");
  await closePanel();

  // the gutter turns black → the downspout follows
  await tid("draw-tool-line").getByRole("button").click(); // a tap picks with any tool but «Водосток» (#687)
  await p.mouse.click(x0 + 1, y1 - (y1 - y0) * 0.15);
  if (!wide) await openProps(p);
  await panel().waitFor({ timeout: 5000 });
  await pickIn("attr-color", "black");
  await waitFor(async () => (await els()).find((e) => e.kind === "downspout")?.attrs.color === "black", "the downspout follows its gutter: black");
  // «Без покраски» is a colour
  await pickIn("attr-color", "@mill");
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
