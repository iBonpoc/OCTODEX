/**
 * e2e 305 — плитка «Добавить фото» на реальном экране «Просмотр замера» (#1166, основатель 12.11), every view.
 * By testID (rule 19): the caption is one line, centred, with room (≥ space[1]) between it and the frame; the icon is centred;
 * the tile keeps the thumbnail's width; the frame is the hairline. A large system font: the tile grows, the caption stays inside.
 */
const { skipLength, closeDsMenu, openView } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction(() => /^Пробный/.test(document.querySelector('[data-testid="module-gutters-status"]')?.textContent?.trim() ?? ""), null, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").first().waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35, x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.6;
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 12, y);
  await p.mouse.up();
  await skipLength(p);
  await closeDsMenu(p).catch(() => {});
  await openView(p);

  const tile = tid("photo-add").first();
  await tile.waitFor({ timeout: 5000 });
  await tile.scrollIntoViewIfNeeded();
  const tb = await tile.boundingBox();
  const cap = tile.locator("div[dir], div").filter({ hasText: /^(Фото|Photo|Foto)$/ }).last();
  const cb = await cap.boundingBox();
  const ib = await tile.locator("svg").first().boundingBox();
  const mid = (r) => r.x + r.width / 2;
  const align = await cap.evaluate((e) => getComputedStyle(e).textAlign);
  const lineH = await cap.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight) || e.getBoundingClientRect().height);
  const space1 = 4;
  h.expect(align === "center", `the caption is text-align center (${align})`);
  h.expect(cb.height <= lineH * 1.2, `the caption is one line (${cb.height} vs ${lineH})`);
  h.expect(Math.abs(mid(cb) - mid(tb)) <= 2 && Math.abs(mid(ib) - mid(tb)) <= 2, "the icon and the caption are centred in the tile");
  h.expect(cb.x - tb.x >= space1 && tb.x + tb.width - (cb.x + cb.width) >= space1, `room between the caption and the frame (${(cb.x - tb.x).toFixed(1)})`);
  h.expect(Math.abs(tb.width - 72) <= 2, `the tile is the thumbnail's width (${tb.width})`);
  const bw = await tile.evaluate((e) => parseFloat(getComputedStyle(e).borderTopWidth));
  h.expect(bw <= 1, `the frame is a hairline (${bw})`);
  await h.shot("add-photo-tile");

  // a large system font: the caption grows but stays inside the tile, the icon keeps its size
  await p.addStyleTag({ content: "html{font-size:150% !important}[data-testid=photo-add] *{font-size:1.5em}" });
  const tb2 = await tile.boundingBox();
  const cb2 = await cap.boundingBox();
  const ib2 = await tile.locator("svg").first().boundingBox();
  h.expect(cb2.x >= tb2.x - 0.5 && cb2.x + cb2.width <= tb2.x + tb2.width + 0.5, "big font: the caption stays inside the tile");
  h.expect(ib2.width >= ib.width - 0.5, "big font: the icon is not squeezed");
};
