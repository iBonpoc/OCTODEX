/**
 * e2e 460 — the sheet's «?» and the centred window's height (DS 1.19.2 Б1, Б7). Every view, through the showcase
 * (Настройки → Дизайн-система → «Окна»: «Шторка со справкой «?»», a long body and a pinned «Сохранить»):
 * - «?» stands right after the title (its left edge ≈ the title's right + space[2]) and not next to «✕»;
 * - «?» opens the help as a page inside the same sheet: one dialog in the DOM, «‹ Назад», the help's text, the link at
 *   the bottom; «‹ Назад» brings the content back — its own state (a counter) and its scroll; Esc on the help page goes back first;
 * - 820 / 1280: with the long body the window keeps ≥ space[8] (32) from the window's top and bottom, the body scrolls
 *   and fades at the edge that has more; header and footer stay in view.
 * Finds things by testID; waits on what it checks. `E2E_SHOTS` — a folder: screenshots of the sheet go there.
 */
const path = require("node:path");
const { MODAL, pressEscUntilClosed, waited } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const { width, theme } = h.layout;
  const wide = width >= 820;
  const vh = p.viewportSize().height;
  const top = () => p.locator(MODAL).last();
  const shot = async (name) => {
    if (!process.env.E2E_SHOTS) return;
    await p.screenshot({ path: path.join(process.env.E2E_SHOTS, `sheet-${name}-${width}-${theme}.png`) });
  };
  const dialogs = () => p.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().height > 0).length, MODAL);

  await h.go("/settings/design-system/windows");
  await p.getByTestId("showcase-windows").locator("visible=true").first().waitFor({ timeout: 8000 });
  const opener = p.getByTestId("showcase-sheet-help").locator("visible=true").first();
  await opener.scrollIntoViewIfNeeded();
  await opener.getByRole("button").first().click();
  const help = top().getByTestId("sheet-help");
  await help.waitFor({ timeout: 5000 });
  h.expect((await top().getByTestId("sheet-title").innerText()).trim() === "Позиции сметы", "the sheet's own title");

  // «?» right after the title, «✕» stays on the right
  const tb = await top().getByTestId("sheet-title").boundingBox();
  const hb = await help.boundingBox();
  const cb = await top().getByTestId("sheet-close").boundingBox();
  const gap = hb.x - (tb.x + tb.width);
  h.expect(gap >= 2 && gap <= 12, `«?» right after the title (gap ${Math.round(gap)}, space[1]–[2])`);
  h.expect(Math.abs(hb.y + hb.height / 2 - (tb.y + tb.height / 2)) <= 12, "«?» on the title's line");
  h.expect(cb.x - (hb.x + hb.width) > 40, `«?» is not next to «✕» (${Math.round(cb.x - (hb.x + hb.width))} apart)`);
  h.expect((await help.getAttribute("aria-label")) === "Справка: Позиции сметы", "«?» says «Справка: Позиции сметы»");

  // the height: 820 / 1280 — the window keeps space[8] from the edges, the body scrolls inside, header and footer in view
  const panel = top().getByTestId("sheet-panel");
  const scroll = top().getByTestId("sheet-scroll");
  const pb = await panel.boundingBox();
  if (wide) {
    h.expect(pb.y >= 32 - 0.5, `the window's top ≥ space[8] from the window's top (${Math.round(pb.y)})`);
    h.expect(vh - (pb.y + pb.height) >= 32 - 0.5, `the window's bottom ≥ space[8] from the window's bottom (${Math.round(vh - pb.y - pb.height)})`);
  }
  const fb = await top().getByTestId("sheet-footer").boundingBox();
  h.expect(fb.y + fb.height <= vh + 1 && fb.y >= pb.y, "the footer stays in view");
  const sc = await scroll.evaluate((el) => ({ h: el.scrollHeight, c: el.clientHeight, fade: el.dataset.fade }));
  h.expect(sc.h > sc.c + 1, `the body scrolls (${sc.h} > ${sc.c})`);
  h.expect(sc.fade === "bottom", `the body fades at the bottom, where there is more (${sc.fade})`);
  // the mask leaves the scroll bar's strip (the side inset, #1339) whole: a second, solid layer on the right
  const mask = await scroll.evaluate((el) => ({ size: el.style.getPropertyValue("mask-size") || el.style.getPropertyValue("-webkit-mask-size"), pos: el.style.getPropertyValue("mask-position") || el.style.getPropertyValue("-webkit-mask-position") }));
  h.expect(/,\s*16px 100%/.test(mask.size) && /100% 0/.test(mask.pos), `the scroll bar's strip is not faded (${mask.size} / ${mask.pos})`);
  await shot("content");

  // the content's own state and a place it was scrolled to
  await top().getByTestId("showcase-help-sheet-pick").click();
  await top().getByTestId("showcase-help-sheet-picked").getByText("Отмечено: 1").waitFor({ timeout: 3000 });
  await scroll.evaluate((el) => void (el.scrollTop = 200));
  await p.waitForFunction((sel) => {
    const el = [...document.querySelectorAll(sel)].pop()?.querySelector('[data-testid="sheet-scroll"]');
    return el && el.dataset.fade === "top bottom";
  }, MODAL, { timeout: 3000 });
  await shot("long");

  // «?» → the help page inside the same sheet
  await help.click();
  const page = top().getByTestId("sheet-help-page");
  await page.waitFor({ timeout: 3000 });
  h.expect((await dialogs()) === 1, "still one dialog: the help is a page, not a second sheet");
  h.expect((await top().getByTestId("sheet-back").count()) === 1, "the help page has «‹ Назад»");
  h.expect((await top().getByTestId("sheet-help").count()) === 0, "no «?» on the help page");
  h.expect((await page.innerText()).includes("Позиции — работы и материалы"), "the help says what it is");
  h.expect((await top().getByTestId("sheet-title").innerText()).trim() === "Справка: Позиции сметы", "the help page's title is «Справка: Позиции сметы»");
  const link = top().getByTestId("sheet-help-to");
  h.expect((await link.count()) === 1 && (await link.getAttribute("role")) === "link", "the way to the catalog is a link at the bottom");
  h.expect((await top().getByRole("button", { name: "Сохранить", exact: true }).count()) === 0, "the content's footer is not on the help page");
  await shot("help");

  // «‹ Назад» brings the content back as it was
  await top().getByTestId("sheet-back").click();
  await top().getByTestId("sheet-help-page").waitFor({ state: "detached", timeout: 3000 });
  await top().getByTestId("sheet-help").waitFor({ timeout: 3000 });
  h.expect((await top().getByTestId("showcase-help-sheet-picked").innerText()).includes("Отмечено: 1"), "the content's state is kept");
  h.expect(await waited(p.waitForFunction((sel) => {
    const el = [...document.querySelectorAll(sel)].pop()?.querySelector('[data-testid="sheet-scroll"]');
    return el && Math.abs(el.scrollTop - 200) <= 2;
  }, MODAL, { timeout: 3000 })), "the content's scroll is given back");
  h.expect((await top().getByTestId("sheet-back").count()) === 0, "back on the content: no «‹ Назад»");

  // Esc on the help page goes back first, not out of the sheet
  await top().getByTestId("sheet-help").click();
  await top().getByTestId("sheet-help-page").waitFor({ timeout: 3000 });
  await pressEscUntilClosed(p, top().getByTestId("sheet-help-page"));
  h.expect((await dialogs()) === 1 && (await top().getByTestId("sheet-help").count()) === 1, "Esc on the help page returns to the content; the sheet stays");
  await pressEscUntilClosed(p);

  // with motion: the help slides in from the right and the window's height glides — no jump in one frame
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await p.reload();
  await p.getByTestId("showcase-windows").locator("visible=true").first().waitFor({ timeout: 8000 });
  const opener2 = p.getByTestId("showcase-sheet-help").locator("visible=true").first();
  await opener2.scrollIntoViewIfNeeded();
  await opener2.getByRole("button").first().click();
  await top().getByTestId("sheet-help").waitFor({ timeout: 5000 });
  await p.waitForFunction((sel) => {
    const el = [...document.querySelectorAll(sel)].pop()?.querySelector('[data-testid="sheet-panel"]');
    return el && getComputedStyle(el).opacity === "1" && !/matrix\(1, 0, 0, 1, 0, [1-9]/.test(getComputedStyle(el).transform);
  }, MODAL, { timeout: 3000 });
  await p.evaluate((sel) => {
    const w = window;
    w.__sheetFrames = [];
    const tick = () => {
      const m = [...document.querySelectorAll(sel)].pop();
      const panel = m?.querySelector('[data-testid="sheet-panel"]');
      const pg = m?.querySelector('[data-testid="sheet-help-page"]');
      w.__sheetFrames.push({ h: panel ? panel.getBoundingClientRect().height : 0, x: pg ? new DOMMatrix(getComputedStyle(pg).transform).m41 : null });
      if (w.__sheetFrames.length < 60) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, MODAL);
  await top().getByTestId("sheet-help").click();
  await p.waitForFunction(() => window.__sheetFrames && window.__sheetFrames.length >= 60, null, { timeout: 5000 });
  const frames = await p.evaluate(() => window.__sheetFrames);
  const hs = frames.map((f) => f.h);
  const total = Math.abs(hs[hs.length - 1] - hs[0]);
  const step = Math.max(...hs.slice(1).map((v, i) => Math.abs(v - hs[i])));
  h.expect(total > 50, `the window changes height for the short help (${Math.round(hs[0])} → ${Math.round(hs[hs.length - 1])})`);
  h.expect(step < total * 0.6, `the height glides, no jump in one frame (largest step ${Math.round(step)} of ${Math.round(total)})`);
  const xs = frames.map((f) => f.x).filter((x) => x !== null);
  h.expect(xs.length > 0 && Math.max(...xs) > 20 && Math.abs(xs[xs.length - 1]) < 1, `the help slides in from the right (x from ${Math.round(Math.max(...xs, 0))} to ${xs.length ? Math.round(xs[xs.length - 1]) : "—"})`);
  await pressEscUntilClosed(p, top().getByTestId("sheet-help-page"));
  await pressEscUntilClosed(p);
};
