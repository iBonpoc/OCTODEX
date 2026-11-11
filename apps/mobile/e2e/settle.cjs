/**
 * Waiting for readiness instead of a fixed sleep (#906 п.4, audit D-07): h.go used to sleep 1000 ms after every goto and
 * h.click 350 ms after every click (≈1000 gotos per pass). `settle` resolves as soon as the page has been quiet — no DOM
 * change, no address change — for `quietMs` (after two animation frames), and at the latest after `maxMs`.
 * `appReady` waits until the app has rendered something to press (the store renders nothing until it has hydrated).
 */
async function settleOnce(page, quietMs, maxMs) {
  await page.evaluate(({ quietMs, maxMs }) => new Promise((resolve) => {
    const start = performance.now();
    let last = start;
    let href = location.href;
    const mo = new MutationObserver(() => { last = performance.now(); });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const tick = () => {
      const now = performance.now();
      if (location.href !== href) { href = location.href; last = now; }
      if (now - last >= quietMs || now - start >= maxMs) { mo.disconnect(); resolve(); } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(() => requestAnimationFrame(tick));
  }), { quietMs, maxMs });
}

async function settle(page, { quietMs = 150, maxMs = 4000 } = {}) {
  // a navigation in the middle of the wait destroys the page context: wait again on the new page
  for (let i = 0; i < 3; i++) {
    try { return await settleOnce(page, quietMs, maxMs); } catch (e) { if (!/context|navigat|destroyed|closed/i.test(String(e))) throw e; }
  }
}

async function appReady(page) {
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0 && document.querySelector('[role="button"], button, a, [role="link"], input'), null, { timeout: 15000 });
}

module.exports = { settle, appReady };
