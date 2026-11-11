/**
 * Waiting for readiness instead of a fixed sleep (#906 п.4, audit D-07): h.go used to sleep 1000 ms after every goto and
 * h.click 350 ms after every click (≈1000 gotos per pass). `settle` resolves as soon as the page has been quiet — no DOM
 * change, no address change — for `quietMs` (after two animation frames), and at the latest after `maxMs`.
 * `appReady` waits until the app has rendered any text (the store renders nothing until it has hydrated). After the quiet
 * window `settle` makes the store write what waits (pagehide), so a spec that reads localStorage right after sees it.
 */
async function settleOnce(page, quietMs, maxMs) {
  await page.evaluate(({ quietMs, maxMs }) => new Promise((resolve) => {
    const start = performance.now();
    let last = start;
    let href = location.href;
    const mo = new MutationObserver(() => { last = performance.now(); });
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    let flushed = false;
    const tick = () => {
      const now = performance.now();
      if (location.href !== href) { href = location.href; last = now; flushed = false; }
      if (now - last >= quietMs || now - start >= maxMs) {
        // The store writes its state 250 ms after a change; a fixed pause used to cover that. «The page is being left»
        // (what a phone sends before it may be killed, appActive.onAppLeave) makes it write NOW — deterministic, no pause.
        if (!flushed) { flushed = true; window.dispatchEvent(new Event("pagehide")); requestAnimationFrame(() => requestAnimationFrame(tick)); return; }
        mo.disconnect(); resolve();
      } else requestAnimationFrame(tick);
    };
    requestAnimationFrame(() => requestAnimationFrame(tick));
  }), { quietMs, maxMs });
}

/** how often the real-time cap ended a settle (the page never went quiet, or the clock hid its own timers): printed by run.cjs */
const stats = { capped: 0 };

async function settle(page, { quietMs = 150, maxMs = 4000 } = {}) {
  // `performance.now` and the animation frames in the page can be driven by the test's fake clock; the cap below counts real
  // time on the Node side, so a wait can never hang a run (and every time it fires is counted, never silent)
  const inner = (async () => {
    // a navigation in the middle of the wait destroys the page context: wait again on the new page
    for (let i = 0; i < 3; i++) {
      try { return await settleOnce(page, quietMs, maxMs); } catch (e) { if (!/context|navigat|destroyed|closed/i.test(String(e))) throw e; }
    }
  })();
  let timer;
  const cap = new Promise((resolve) => { timer = setTimeout(() => { stats.capped++; resolve(); }, maxMs + 2000); });
  try { await Promise.race([inner, cap]); } finally { clearTimeout(timer); inner.then(() => {}, () => {}); }
}

async function appReady(page) {
  await page.waitForFunction(() => document.body && document.body.innerText.trim().length > 0, null, { timeout: 15000 });
}

module.exports = { settle, appReady, stats };
