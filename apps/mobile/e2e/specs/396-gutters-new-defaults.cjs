/**
 * e2e 396 — #1563 PR B (founder 14.11: «на таб-баре, когда нажимаю два раза на этот [желоб] или на даунспот — свойства»; spec
 * 33-gutters-canvas-ui «Двойное нажатие на инструмент»). Two taps on «Желоб» in the toolbar open «Новые желоба»; a colour picked there is the
 * colour of every NEW gutter of this drawing, the gutter drawn before keeps its own; after a reload it is still there (kept on this phone);
 * «Как в настройках компании» gives the company's back. The same for «Водосток» (a size). Every view. Finds things by testID; waits on what it checks.
 */
const { skipLength, pastDoubleTap, doubleTapUntil } = require("../gutters.cjs");
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const els = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt), KEY);
  const runs = async () => (await els()).filter((e) => e.kind === "run");
  const chosen = async (field) => ((await tid(`${field}-value`).count()) ? tid(`${field}-value`).innerText() : tid(field).locator('[aria-checked="true"]').innerText());
  const choose = async (field, name) => {
    if ((await tid(`${field}-open`).count()) && !(await tid(field).getByRole("radio").count())) await tid(`${field}-open`).click();
    await tid(field).getByRole("radio", { name, exact: true }).click();
  };
  const shown = () => p.evaluate(() => [...document.querySelectorAll('[data-testid="draw-new-defaults"]')].some((e) => e.getClientRects().length > 0));
  /** two taps on a tool cell: «Новые …» open */
  const openNew = async (tool) => {
    await pastDoubleTap(p);
    const b = await tid(`draw-tool-${tool}`).boundingBox();
    // the toolbar does not move when a tool is picked (the first of the two taps): the second lands on the same cell
    await tid(`draw-tool-${tool}`).getByRole("button").click();
    await pastDoubleTap(p);
    const b1 = await tid(`draw-tool-${tool}`).boundingBox();
    h.expect(Math.abs(b1.y - b.y) < 1 && Math.abs(b1.x - b.x) < 1, `picking «${tool}» does not move the toolbar (${Math.round(b.y)} → ${Math.round(b1.y)})`);
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

  // two taps on «Желоб»: «Новые желоба»; brown there
  await openNew("line");
  h.expect((await tid("attr-length").count()) === 0 && (await tid("attr-story").count()) === 0, "no length and no story among the new gutters' rows");
  await choose("attr-color", "Коричневый");
  await p.waitForFunction(() => /Коричнев/.test(document.querySelector('[data-testid="draw-new-defaults"]')?.textContent || ""), null, { timeout: 5000 });
  await h.shot("new-runs");
  await closeNew();

  // a new gutter is brown; the first one keeps white
  await stroke(0.6);
  await waitRuns(2);
  const two = await runs();
  const second = two.find((r) => r.id !== first.id);
  h.expect(second.attrs.color === "brown", `the new gutter: brown (${second.attrs.color})`);
  h.expect(two.find((r) => r.id === first.id).attrs.color === "white", "the gutter drawn before: still white");

  // «Водосток» (before the reload: the reload fits the drawing to the screen and a gutter may lie under the toolbar — #1630): two taps — «Новые водостоки», its own rows
  await openNew("ds");
  await tid("attr-ds-size").waitFor({ timeout: 5000 });
  h.expect(/Новые водостоки/.test(await tid("draw-new-defaults").innerText()), "«Новые водостоки»");
  await closeNew();
  // after a reload (the same measurement): still brown for new ones (kept on this phone)
  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await openNew("line");
  h.expect((await chosen("attr-color")) === "Коричневый", `after a reload: «Новые желоба» still brown (${await chosen("attr-color")})`);
  // «Как в настройках компании»: white again
  await tid("draw-new-defaults-reset").getByRole("button").click();
  await p.waitForFunction(() => !/Коричнев/.test(document.querySelector('[data-testid="draw-new-defaults"]')?.textContent || ""), null, { timeout: 5000 });
  h.expect((await tid("draw-new-defaults-reset").count()) === 0, "nothing of its own: no reset");
  await closeNew();

  // one tap on a tool still just picks it (no properties)
  await pastDoubleTap(p);
  await tid("draw-tool-line").getByRole("button").click();
  await pastDoubleTap(p);
  h.expect(!(await shown()), "one tap on a tool: it is picked, nothing opens");
};
