/**
 * e2e 253 — #929: the downspout's kind is one choice of four (#2412 G1: a field with a menu, no tiles), and the
 * picked kind shows on the bottom bar. Every view.
 * - the downspout's properties: «Вид» on top, its menu has four (rect / round × smooth / ribbed), the smooth rectangular picked;
 * - «Прямой ребристый» → the store says rect + corrugated, the bar says «ребристый · 2×3» with the kind's icon;
 * - «Круглый ребристый» → round + corrugated, the size follows the shape (3″), the bar «3″»;
 * - «Круглый гладкий» → plain; no item's words run over its frame in the menu;
 * - «Назад» takes the last pick back.
 * No fixed pauses: it waits on what it checks.
 */
const { skipLength, pickAttr, attrKeys, attrChosen, attrClose, winSave, tilesEven, pairFits, openAttrMore } = require("../gutters.cjs");
const { sheetGone } = require("../sheet.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
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
  await p.waitForFunction(() => /^Без срока/.test(([...document.querySelectorAll('[data-testid="module-gutters-status"]')].find((e) => e.getBoundingClientRect().height > 0)?.innerText ?? "").trim()), null, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  await stroke([b.x + b.width * 0.08, y], [b.x + b.width * 0.4, y]);
  await tid("quick-length").waitFor({ timeout: 5000 });

  await tid("quick-length-apply").getByRole("button").click();
  await tid("quick-length").waitFor({ state: "detached", timeout: 5000 });
  const wide = h.layout.width > 390;
  const ds = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "downspout" && !e.deletedAt).map((e) => e.attrs)[0] || null, KEY);
  const stored = async (what, ok) => {
    await p.waitForFunction(([k, src]) => {
      const e = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).find((x) => x.kind === "downspout" && !x.deletedAt);
      return !!e && new Function("a", `return ${src}`)(e.attrs);
    }, [KEY, ok], { timeout: 5000 }).catch(() => h.expect(false, what));
  };
  const bar = () => tid("draw-selected").innerText();
  // a downspout on the gutter, its menu
  await tid("draw-tool-ds").getByRole("button").click();
  const surf = await p.getByTestId("draw-surface").boundingBox();
  await p.mouse.click(surf.x + surf.width * 0.24, surf.y + surf.height * 0.42 + 3);
  await p.getByTestId("draw-svg").first().locator("circle").first().waitFor({ timeout: 5000 }); // the downspout mark
  await tid("attr-panel").waitFor({ timeout: 5000 });
  await tid("attr-ds-kind").waitFor({ timeout: 5000 }); // on top, every width (#2412 G1)
  const kinds = await attrKeys(p, "attr-ds-kind");
  h.expect(["rectPlain", "rectRibbed", "roundPlain", "roundRibbed"].every((k) => kinds.includes(k)) && kinds.length === 4, `the menu has the four kinds (${kinds.join(",")})`);
  h.expect((await attrChosen(p, "attr-ds-kind")) === "rectPlain", "the smooth rectangular one is picked by default");
  h.expect((await tid("attr-shape").count()) === 0 && (await tid("attr-ds-style").count()) === 0, "no separate shape and style rows any more");

  await pickAttr(p, "attr-ds-kind", "rectRibbed");
  await stored("the store: rect + corrugated", "a.shape === 'rect' && a.dsStyle === 'corrugated'");
  await tid("draw-selected-kind").waitFor({ timeout: 5000 });
  h.expect(/Corrugated/.test(await bar()) && /2×3/.test(await bar()), `the bar names the kind and the size (${await bar()})`);

  await pickAttr(p, "attr-ds-kind", "roundRibbed");
  await stored("the store: round + corrugated, a round size", "a.shape === 'round' && a.dsStyle === 'corrugated' && a.size === '3'");
  h.expect(/Corrugated\s+Round/.test(await bar()) && /3″/.test(await bar()), `the bar: round, corrugated, 3″ (${await bar()})`);
  h.expect((await attrChosen(p, "attr-ds-kind")) === "roundRibbed", "the picked kind is marked in the menu");

  await pickAttr(p, "attr-ds-kind", "roundPlain");
  await stored("the store: round + plain", "a.shape === 'round' && (a.dsStyle === 'plain' || a.dsStyle === undefined)");
  // four tiles with icons (founder 27.11, #2980: «не селектор, это должны быть иконки»); no tile's words run over its frame
  const items = tid("attr-ds-kind").locator('[data-testid^="attr-ds-kind-"][role="radio"]');
  const over = await items.evaluateAll((es) => es.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 || !e.querySelector("svg")).map((e) => e.getAttribute("data-testid")));
  h.expect(over.length === 0 && (await items.count()) === 4, `four tiles with an icon each, none overflows (${over.join(",")})`);
  h.expect((await tid("attr-ds-kind-button").count()) === 0, "the kind is no menu field any more");
  // #3051: the tiles are one width and height, in one row; the pairs stand in one line, nothing cut — with the longest words
  { const bad = await tilesEven(p, "attr-ds-kind"); h.expect(bad === "", `the kind tiles are even (${bad})`); }
  await pickAttr(p, "attr-head", "conductor"); // «Leader head» — the longest top
  { const bad = await pairFits(p, "attr-ds-size", "attr-ds-story"); h.expect(bad === "", `size · storey in one line (${bad || "ok"})`); }
  // every bottom beside the longest top: none is cut
  for (const key of await attrKeys(p, "attr-bottom")) {
    await pickAttr(p, "attr-bottom", key);
    const bad = await pairFits(p, "attr-bottom", "attr-head");
    h.expect(bad === "", `Низ · Верх in one line with «${key}» (${bad || "ok"})`);
  }
  await openAttrMore(p);
  if (await tid("attr-gauge-button").count()) { const bad = await pairFits(p, "attr-material", "attr-gauge"); h.expect(bad === "", `material · gauge (${bad || "ok"})`); }
  await h.shot("pairs");
  await h.shot("kinds");

  // «Сохранить» keeps the window's picks as ONE step (DS §7.3, #2412 PR3): one «Назад» takes them all back — smooth rectangular again
  await winSave(p);
  await tid("draw-undo").getByRole("button").click();
  await stored("«Назад»: the window's three picks as one step — smooth rectangular again", "a.shape === 'rect' && (a.dsStyle === 'plain' || a.dsStyle === undefined)");
};
