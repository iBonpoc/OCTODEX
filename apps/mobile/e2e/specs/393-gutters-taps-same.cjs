/**
 * e2e 393 — #1563 (founder 14.11: «если у меня выбран даунспот и я нажимаю на даунспот, то открывается сразу меню… если выбран жёлоб,
 * то надо два раза нажать»). One rule for every tool: one tap on a thing picks it, two taps open its properties. A downspout put with
 * «Водосток» does not open its menu by itself any more (on the phone; a wide screen shows what is picked in its side panel, by design).
 * Every view. Finds things by testID; waits on what it checks (no pauses).
 */
const { skipLength, openDsMenu, pastDoubleTap } = require("../gutters.cjs");
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const panelShown = () => p.evaluate(() => [...document.querySelectorAll('[data-testid="attr-panel"]')].some((e) => e.getClientRects().length > 0));
  const dsCount = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "downspout").length, KEY);
  const mark = async () => (await svg().locator("circle").evaluateAll((cs) => cs.map((c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })))[0];
  // the phone's sheet closes; a wide screen's side panel shows what is picked (by design: a pick shows its properties there)
  const closeMenu = async () => {
    if (wide) return;
    await pressEscUntilClosed(p);
    await sheetGone(p);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4;
  const [x0, x1] = [b.x + b.width * 0.15, b.x + b.width * 0.6];
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 12, y);
  await p.mouse.up();
  await skipLength(p);

  // «Водосток», a tap on the gutter: a downspout is put — and NO menu opens by itself
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click(x0 + (x1 - x0) * 0.4, y);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => !e.deletedAt && e.kind === "downspout"), KEY, { timeout: 8000 });
  await svg().locator("circle").first().waitFor({ timeout: 5000 });
  if (!wide) h.expect(!(await panelShown()), "a downspout put with «Водосток»: no menu by itself (a wide screen shows a pick in its side panel)");

  // «Водосток», ONE tap on the downspout: picked, no menu, no second one on top
  await pastDoubleTap(p);
  const m = await mark();
  await p.mouse.click(m[0], m[1]);
  await pastDoubleTap(p);
  if (!wide) h.expect(!(await panelShown()), "«Водосток», one tap on a downspout: no menu");
  h.expect((await dsCount()) === 1, "…and no second downspout");
  // TWO taps: its menu
  await openDsMenu(p, m);
  h.expect(await panelShown(), "«Водосток», two taps on a downspout: its menu");
  await closeMenu();

  // the same with «Желоб»: one tap picks, two open
  await tid("draw-tool-line").getByRole("button").click();
  await pastDoubleTap(p);
  await p.mouse.click(m[0], m[1]);
  await pastDoubleTap(p);
  if (!wide) h.expect(!(await panelShown()), "«Желоб», one tap on a downspout: no menu");
  await openDsMenu(p, m);
  h.expect(await panelShown(), "«Желоб», two taps on a downspout: its menu — the same rule");
  await h.shot("taps");
};
