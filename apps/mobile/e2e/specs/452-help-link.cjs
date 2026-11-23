/**
 * e2e 452 — «?» (DS 1.18.0 Б7, founder 16.11, #1843, #1853). Every view.
 * - in the showcase («Окна»): «?» stands right after its words (its left edge close to the words' right edge, on their line);
 *   inside — what it is, then the way: «Изменить в настройках» opens the company's settings, «Открыть поставщиков» — suppliers;
 * - Gutters «Просмотр замера» → «Детали»: a group's «?» is right after the group's title and leads to the module's settings; the
 *   parts' own «?» leads to «Цены и прайс», where the parts are made and priced (#2118).
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, openView, pressWhenStill, canvasAt } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  /** the «?» is next to the words before it: the same line, a gap of at most 16 */
  const besideWords = async (helpId, label) => {
    const hb = await tid(helpId).first().boundingBox();
    const words = tid(helpId).first().locator("xpath=preceding-sibling::*[1]");
    const wb = await words.boundingBox();
    h.expect(hb && wb && hb.x - (wb.x + wb.width) <= 16 && hb.x >= wb.x + wb.width - 1, `${label}: «?» right after its words (${wb && Math.round(wb.x + wb.width)} → ${hb && Math.round(hb.x)})`);
    h.expect(hb && wb && Math.abs(hb.y + hb.height / 2 - (wb.y + wb.height / 2)) <= 12, `${label}: «?» on the words' line`);
  };
  const follow = async (helpId, path) => {
    await tid(helpId).first().scrollIntoViewIfNeeded();
    await tid(helpId).first().click();
    await tid(`${helpId}-to`).waitFor({ timeout: 5000 });
    await tid(`${helpId}-to`).click();
    await p.waitForURL((u) => u.pathname.startsWith(path), { timeout: 8000 });
    h.expect(new URL(p.url()).pathname.startsWith(path), `${helpId} leads to ${path} (${p.url()})`);
  };

  await h.go("/settings/design-system/windows");
  await tid("showcase-help").waitFor({ timeout: 8000 });
  await besideWords("showcase-help-setting", "a setting");
  await besideWords("showcase-help-object", "an object");
  await follow("showcase-help-setting", "/company");
  await h.go("/settings/design-system/windows");
  await tid("showcase-help").waitFor({ timeout: 8000 });
  await follow("showcase-help-object", "/suppliers");

  // Gutters: a group of parts — its «?» next to the title, to the module's settings
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Без срока/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4, x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.7;
  await canvasAt(p, x0, y);
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 10, y);
  await p.mouse.up();
  await skipLength(p);
  await tid("draw-done").waitFor({ timeout: 8000 });
  await openView(p);
  await pressWhenStill(tid("view-details").getByRole("button"));
  await tid("view-parts-gutter").waitFor({ timeout: 5000 });
  await besideWords("view-parts-gutter-help", "the group «Gutter»");
  await h.shot("help");
  await follow("view-parts-gutter-help", "/module/gutters/settings");
  // #2118: the parts' «?» — to the price list of the module
  await p.goBack();
  await tid("view-parts-help").first().waitFor({ timeout: 8000 });
  await follow("view-parts-help", "/module/gutters/prices");
};
