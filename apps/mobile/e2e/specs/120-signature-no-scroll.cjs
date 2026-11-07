/**
 * Founder 07.11 (phone): «на поле росписи страница скроллится вместе с пальцем — подписать нельзя».
 * A finger drawn over the signature field draws the signature and does NOT move the page, every view.
 * Web: the field must not hand the touch to the browser's scroll (touch-action: none); native (iOS): the screen's
 * ScrollView is locked while drawing (ScrollLock) — that part is checked by hand on the phone (PR text).
 */
exports.run = async (h) => {
  const p = h.page;
  // the client's page /p/: the estimate is long, the field sits low — the page can scroll
  await h.go("/p/demo0handyman0estimate0000000001");
  await p.getByPlaceholder(/Ваше имя|Your name/).last().fill("Linda Alvarez");
  await p.getByRole("switch", { name: /E-SIGN/ }).last().click();
  const pad = p.getByLabel(/расписывается|signs here/i).last();
  await pad.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  // the scroll container of the screen (RN-web ScrollView) or the window
  const scrollTop = () => p.evaluate(() => {
    const els = [...document.querySelectorAll("div")].filter((e) => e.scrollHeight > e.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
    return Math.round(Math.max(window.scrollY, ...els.map((e) => e.scrollTop)));
  });
  const ta = await pad.evaluate((e) => getComputedStyle(e).touchAction);
  h.expect(ta === "none", `the field keeps the touch for drawing (touch-action: ${ta})`);
  const before = await scrollTop();
  const bb = await pad.boundingBox();
  // a real finger: touch events through CDP (Playwright's touchscreen only taps)
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
  const x0 = bb.x + 30, y0 = bb.y + bb.height - 20;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(x0, y0) });
  for (let i = 1; i <= 20; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(x0 + i * 10, y0 - i * 5) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await p.waitForTimeout(400);
  const after = await scrollTop();
  h.expect(Math.abs(after - before) <= 1, `the page did not move under the finger (${before} → ${after})`);
  const approve = p.getByRole("button", { name: /Одобрить и подписать|Approve and sign/ }).last();
  h.expect(await approve.isEnabled(), "the stroke is drawn — «Одобрить и подписать» is on");
  await h.shot("signed-by-finger");
};
