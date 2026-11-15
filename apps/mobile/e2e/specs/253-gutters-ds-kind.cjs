/**
 * e2e 253 — #929 (DESIGN-SYSTEM tiles): the downspout's kind is one choice of four tiles with their own icons, and the
 * picked kind shows on the bottom bar. Every view.
 * - the downspout's properties: «Вид» with four tiles (rect / round × smooth / ribbed), the smooth rectangular picked;
 * - «Прямой ребристый» → the store says rect + corrugated, the bar says «ребристый · 2×3» with the kind's icon;
 * - «Круглый ребристый» → round + corrugated, the size follows the shape (3″), the bar «3″»;
 * - «Круглый гладкий» → plain; no tile's words run over its frame;
 * - «Назад» takes the last pick back.
 * No fixed pauses: it waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
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
  await p.waitForFunction(() => /^Пробный/.test(([...document.querySelectorAll('[data-testid="module-gutters-status"]')].find((e) => e.getBoundingClientRect().height > 0)?.innerText ?? "").trim()), null, { timeout: 8000 });
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
  if (!wide && (await tid("attr-more").count())) {
    await tid("attr-more").getByRole("button").click();
    await tid("attr-more-open").waitFor({ timeout: 5000 });
  }
  await tid("attr-ds-kind").waitFor({ timeout: 5000 });
  const tiles = ["rectPlain", "rectRibbed", "roundPlain", "roundRibbed"];
  for (const k of tiles) h.expect((await tid(`attr-ds-kind-${k}`).count()) === 1, `the tile ${k}`);
  h.expect((await tid("attr-ds-kind-rectPlain").getAttribute("aria-checked")) === "true", "the smooth rectangular one is picked by default");
  h.expect((await tid("attr-shape").count()) === 0 && (await tid("attr-ds-style").count()) === 0, "no separate shape and style rows any more");

  await tid("attr-ds-kind-rectRibbed").click();
  await stored("the store: rect + corrugated", "a.shape === 'rect' && a.dsStyle === 'corrugated'");
  await tid("draw-selected-kind").waitFor({ timeout: 5000 });
  h.expect(/ребристый/.test(await bar()) && /2×3/.test(await bar()), `the bar names the kind and the size (${await bar()})`);

  await tid("attr-ds-kind-roundRibbed").click();
  await stored("the store: round + corrugated, a round size", "a.shape === 'round' && a.dsStyle === 'corrugated' && a.size === '3'");
  h.expect(/Круглый ребристый/.test(await bar()) && /3″/.test(await bar()), `the bar: round, ribbed, 3″ (${await bar()})`);
  h.expect((await tid("attr-ds-kind-roundRibbed").getAttribute("aria-checked")) === "true", "the picked tile says so");

  await tid("attr-ds-kind-roundPlain").click();
  await stored("the store: round + plain", "a.shape === 'round' && (a.dsStyle === 'plain' || a.dsStyle === undefined)");
  // no tile's words run over its frame
  const over = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="attr-ds-kind-"]')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map((e) => e.getAttribute("data-testid")));
  h.expect(over.length === 0, `no tile overflows (${over.join(",")})`);
  await h.shot("kinds");

  // «Назад» takes the last pick back (on the phone the properties sheet is closed first)
  if (!wide) {
    await p.getByRole("button", { name: "Закрыть", exact: true }).first().click({ position: { x: 10, y: 10 } }); // the scrim above the sheet
    await tid("attr-panel").waitFor({ state: "detached", timeout: 5000 });
    await sheetGone(p);
  }
  await tid("draw-undo").getByRole("button").click();
  await stored("«Назад»: ribbed round again", "a.shape === 'round' && a.dsStyle === 'corrugated'");
};
