/**
 * Spec 29 (founder 07.11): on a small phone the signature opens on the whole screen, along the long side.
 * - 390: «Развернуть на весь экран» → the full-screen pad, turned 90° in a portrait window; a finger drawn down the
 *   phone draws along the canvas; «Готово» brings the stroke back to the field («Одобрить и подписать» is on);
 *   «Отмена» keeps the field as it was; the phone turned to landscape (844 × 390): the pad is upright.
 * - 820 / 1280: no «Развернуть» (the field is wide enough).
 * Client page /p/ (the pad of the estimate signing), every view.
 */
exports.run = async (h) => {
  const p = h.page;
  const phone = h.layout.width === 390;
  await h.go("/p/demo0handyman0estimate0000000001");
  await p.getByPlaceholder(/Ваше имя|Your name/).last().fill("Linda Alvarez");
  await p.getByRole("switch", { name: /E-SIGN/ }).last().click();
  // the client page speaks the client's language (rule 7): the demo client may be English
  const expand = p.getByRole("button", { name: /^(Развернуть на весь экран|Full screen|Pantalla completa)$/ });
  if (!phone) {
    h.expect((await expand.locator("visible=true").count()) === 0, `no «Развернуть» on ${h.layout.width}`);
    return;
  }
  await expand.last().scrollIntoViewIfNeeded();
  await expand.last().click();
  await p.waitForTimeout(500);
  const full = p.locator('[data-testid="sig-full"]');
  h.expect((await p.locator('[data-testid="sig-full-turned"]').count()) === 1, "portrait window: the canvas is turned along the long side");
  const canvas = p.locator('[data-testid="sig-full-turned"] [aria-label]').first();
  const bb = await canvas.boundingBox();
  h.expect(bb && bb.height > bb.width, `the turned canvas runs down the phone (${bb && Math.round(bb.width)} × ${bb && Math.round(bb.height)})`);
  // a finger down the phone (CDP touch)
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const x0 = bb.x + bb.width / 2, y0 = bb.y + 30;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: Math.round(x0), y: Math.round(y0), id: 1 }] });
  for (let i = 1; i <= 25; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: Math.round(x0 + Math.sin(i / 3) * 30), y: Math.round(y0 + i * 18), id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await p.waitForTimeout(300);
  const d = await full.locator("path").first().getAttribute("d");
  const nums = (d ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const xs = nums.filter((_, i) => i % 2 === 0);
  h.expect(xs.length > 10 && Math.max(...xs) - Math.min(...xs) > 300, `the stroke runs along the canvas (x span ${Math.round(Math.max(...xs) - Math.min(...xs))})`);
  await h.shot("full-turned");
  await full.getByRole("button", { name: /^(Готово|Done|Listo)$/ }).click();
  await p.waitForTimeout(400);
  h.expect((await full.count()) === 0 || !(await full.isVisible()), "«Готово» closes the full screen");
  const approve = p.getByRole("button", { name: /Одобрить и подписать|Approve and sign/ }).last();
  h.expect(await approve.isEnabled(), "the stroke is back in the field — «Одобрить и подписать» is on");
  const fieldD = await p.getByLabel(/расписывается|signs here/i).last().locator("path").first().getAttribute("d");
  const fx = (fieldD ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number).filter((_, i) => i % 2 === 0) ?? [];
  h.expect(fx.length === xs.length && Math.max(...fx) <= 400, `the same points, scaled to the field (${fx.length} vs ${xs.length})`);

  // «Отмена» keeps the field as it was
  await expand.last().click();
  await p.waitForTimeout(400);
  await full.getByRole("button", { name: /^(Очистить|Clear|Borrar)/ }).last().click();
  await full.getByRole("button", { name: /^(Отмена|Cancel|Cancelar)$/ }).last().click();
  await p.waitForTimeout(400);
  const after = await p.getByLabel(/расписывается|signs here/i).last().locator("path").first().getAttribute("d");
  h.expect(after === fieldD, "«Отмена» keeps the signature in the field");

  // the phone turned to landscape while the full screen is open: the pad is upright. (Opened first, then turned: in an
  // 844-wide window the field itself is wide enough and has no «Развернуть» — the old order skipped this check silently, #800.)
  await expand.last().click();
  await p.locator('[data-testid="sig-full"]').first().waitFor({ timeout: 5000 });
  await p.setViewportSize({ width: 844, height: 390 });
  await p.waitForTimeout(300);
  h.expect((await p.locator('[data-testid="sig-full-upright"]').count()) === 1, "landscape window: the canvas is upright");
  await h.shot("full-landscape");
  await p.setViewportSize({ width: 390, height: 844 });
};
