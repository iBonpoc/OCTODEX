/**
 * e2e 396 — #1563 PR B (founder 14.11: «на таб-баре, когда нажимаю два раза на этот [желоб] или на даунспот — свойства»; spec
 * 33-gutters-canvas-ui «Двойное нажатие на инструмент»). Two taps on «Желоб» in the toolbar open «Для новых желобов»; a colour picked there is the
 * colour of every NEW gutter of this drawing, the gutter drawn before keeps its own; after a reload it is still there (kept on this phone);
 * «Сбросить» gives the company's back. The same for «Водосток» (a size). Every view. Finds things by testID; waits on what it checks.
 */
const { skipLength, pastDoubleTap, doubleTapUntil, pickAttr, attrShown, winSave, pairFits, tilesEven } = require("../gutters.cjs");
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const els = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt), KEY);
  const runs = async () => (await els()).filter((e) => e.kind === "run");
  // the fields (#2412 G1): what one shows; a stored key picked in its menu or list
  const chosen = (field) => attrShown(p, field);
  const choose = (field, key) => pickAttr(p, field, key);
  const shown = () => p.evaluate(() => [...document.querySelectorAll('[data-testid="draw-new-defaults"]')].some((e) => e.getClientRects().length > 0));
  /** two taps on a tool cell: «Новые …» open */
  const openNew = async (tool) => {
    await pastDoubleTap(p);
    const b = await tid(`draw-tool-${tool}`).boundingBox();
    // the toolbar does not move when a tool is picked (the first of the two taps): the second lands on the same cell
    await tid(`draw-tool-${tool}`).getByRole("button").click();
    const b1 = await tid(`draw-tool-${tool}`).boundingBox(); // inside the window of a second tap: where the second tap goes
    h.expect(Math.abs(b1.y - b.y) < 1 && Math.abs(b1.x - b.x) < 1, `picking «${tool}» does not move the toolbar (${Math.round(b.y)} → ${Math.round(b1.y)})`);
    // the pick is NOT the first half of the two taps: with it they were three, and the third landed in the sheet the first two had opened —
    // on whatever field stands over the toolbar there (#2662: «Вид» on its own line put «Верх» there; its list covered «Размер»)
    await pastDoubleTap(p);
    await doubleTapUntil(p, b.x + b.width / 2, b.y + b.height / 2, { fn: () => [...document.querySelectorAll('[data-testid="draw-new-defaults"]')].some((e) => e.getClientRects().length > 0), arg: null }, `two taps on «${tool}»: its new ones' properties`);
  };
  const closeNew = async () => {
    if (wide) await tid("draw-panel-close").getByRole("button").click();
    else {
      await pressEscUntilClosed(p);
      await sheetGone(p);
    }
    await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="draw-new-defaults"]')].some((e) => e.getClientRects().length > 0), null, { timeout: 5000 });
  };
  const dsOf = async () => (await els()).filter((e) => e.kind === "downspout");
  const waitDs = (n) => p.waitForFunction(([k, want]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "downspout").length === want, [KEY, n], { timeout: 8000 });
  /** a downspout's menu (it opens by itself when one is put) closed */
  const closeAttrs = async () => {
    await tid("attr-panel").waitFor({ timeout: 5000 });
    await winSave(p); // the window's own «Сохранить» (DS §7.3, #2412 PR3): its edits kept
  };
  /** «Водосток» picked, a tap on the gutter drawn at `y` (a share of the surface) */
  const putDs = async (y, n) => {
    await pastDoubleTap(p);
    await tid("draw-tool-ds").getByRole("button").click();
    await pastDoubleTap(p);
    const b = await p.getByTestId("draw-surface").boundingBox();
    await p.mouse.click(b.x + b.width * 0.35, b.y + b.height * y);
    await waitDs(n);
    await closeAttrs();
  };
  const stroke = async (y) => {
    const b = await p.getByTestId("draw-surface").boundingBox();
    const a = [b.x + b.width * 0.15, b.y + b.height * y], z = [b.x + b.width * 0.55, b.y + b.height * y];
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((z[0] - a[0]) * i) / 12, a[1]);
    await p.mouse.up();
    await skipLength(p);
  };
  const waitRuns = (n) => p.waitForFunction(([k, want]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "run").length === want, [KEY, n], { timeout: 8000 });

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });

  // a gutter with the company's defaults (white)
  await stroke(0.25);
  await waitRuns(1);
  const first = (await runs())[0];
  h.expect(first.attrs.color === "white", `the first gutter: the company's colour (${first.attrs.color})`);

  // two taps on «Желоб»: «Для новых желобов»; brown there
  await openNew("line");
  h.expect((await tid("attr-length").count()) === 0 && (await tid("attr-story").count()) === 0, "no length and no story among the new gutters' rows");
  await choose("attr-color", "brown");
  await p.waitForFunction(() => /Brown/.test(document.querySelector('[data-testid="draw-new-defaults"]')?.textContent || ""), null, { timeout: 5000 });
  // #3015 / #3051: «Для новых» — Размер · Цвет in one line, nothing cut; the profile tiles even
  { const bad = await pairFits(p, "attr-size", "attr-color"); h.expect(bad === "", `size · colour in one line (${bad || "ok"})`); }
  { const bad = await tilesEven(p, "attr-profile"); h.expect(bad === "", `the profile tiles are even (${bad})`); }
  await h.shot("new-runs");
  await closeNew();

  // a new gutter is brown; the first one keeps white
  await stroke(0.6);
  await waitRuns(2);
  const two = await runs();
  const second = two.find((r) => r.id !== first.id);
  h.expect(second.attrs.color === "brown", `the new gutter: brown (${second.attrs.color})`);
  h.expect(two.find((r) => r.id === first.id).attrs.color === "white", "the gutter drawn before: still white");

  // «Водосток» (before the reload: the reload fits the drawing to the screen and a gutter may lie under the toolbar — #1630)
  // a downspout put before: the company's size
  await putDs(0.25, 1);
  const dsBefore = (await dsOf())[0];
  // two taps — «Для новых водостоков», its own rows; 3×4 there
  await openNew("ds");
  await tid("attr-ds-size").waitFor({ timeout: 5000 });
  await choose("attr-ds-size", "3x4");
  await p.waitForFunction(() => /3×4/.test(document.querySelector('[data-testid="draw-new-defaults"]')?.textContent || ""), null, { timeout: 5000 });
  // the title: the phone's sheet has it in its header (with «✕»), wider the column has it on top
  const title = wide ? await tid("draw-new-defaults").innerText() : await tid("sheet-title").innerText();
  h.expect(/Для новых downspout/.test(title), `«Для новых downspout» (${JSON.stringify(title.slice(0, 60))})`);
  if (!wide) h.expect((await tid("sheet-close").count()) === 1, "the phone's sheet has its «✕»");
  await closeNew();
  // a new downspout is 3×4; the one put before keeps the company's size
  await putDs(0.6, 2);
  const dsNew = (await dsOf()).find((x) => x.id !== dsBefore.id);
  h.expect(dsNew.attrs.size === "3x4", `the new downspout: 3×4 (${dsNew.attrs.size})`);
  h.expect((await dsOf()).find((x) => x.id === dsBefore.id).attrs.size === dsBefore.attrs.size && dsBefore.attrs.size !== "3x4", `the downspout put before: still ${dsBefore.attrs.size}`);
  // after a reload (the same measurement): still brown for new ones (kept on this phone)
  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await openNew("line");
  h.expect((await chosen("attr-color")) === "Brown", `after a reload: «Для новых gutter» still brown (${await chosen("attr-color")})`);
  // «Сбросить»: white again (as in the company's settings)
  await tid("draw-new-defaults-reset").getByRole("button").click();
  await p.waitForFunction(() => !document.querySelector('[data-testid="draw-new-defaults-reset"]'), null, { timeout: 5000 });
  h.expect((await chosen("attr-color")) === "White", `«Сбросить»: the company's colour again (${await chosen("attr-color")})`);
  await closeNew();
  // a gutter drawn now is white again (between the two that are there after the reload fitted them to the screen)
  const before = (await runs()).length;
  await stroke(0.45);
  await waitRuns(before + 1);
  const newest = (await runs()).find((r) => r.id !== first.id && r.id !== second.id);
  h.expect(newest.attrs.color === "white", `after «Сбросить»: a new gutter is white again (${newest.attrs.color})`);
  // «Для новых водостоков» after the reload: still 3×4; «Сбросить» — the company's size
  await openNew("ds");
  h.expect(/3×4/.test(await chosen("attr-ds-size")), `after a reload: «Для новых downspout» still 3×4 (${await chosen("attr-ds-size")})`);
  await tid("draw-new-defaults-reset").getByRole("button").click();
  await p.waitForFunction(() => !document.querySelector('[data-testid="draw-new-defaults-reset"]'), null, { timeout: 5000 });
  h.expect(!/3×4/.test(await chosen("attr-ds-size")), "«Сбросить»: the company's size again");
  await closeNew();

  // one tap on a tool still just picks it (no properties)
  await pastDoubleTap(p);
  await tid("draw-tool-line").getByRole("button").click();
  await pastDoubleTap(p);
  h.expect(!(await shown()), "one tap on a tool: it is picked, nothing opens");
};
