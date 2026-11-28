/**
 * #3154 (founder, build 3144): on an estimate's tab «Подпись на месте» a finger on the signature field scrolled the whole screen
 * and nothing could be signed. The tab's content is the Screen's `below` and it had no scroll lock (ScrollLockCtx) — the pad's
 * lock was a no-op there. Every view, by testID: while the stroke is drawn the page's scroll is off (RN Web: `scrollEnabled={false}`
 * → `overflow: hidden` on the page's scroll), after the finger is lifted it is on again, and the stroke is on the pad.
 * The iPhone itself (a real finger) — rule 27, «Натив:» in the PR.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  await h.go("/today");
  const s = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  const est = s.db.estimates.find((e) => (e.status === "draft" || e.status === "sent") && e.customerId && e.doc);
  h.expect(!!est, "the demo has a draft or sent estimate");
  await h.go(`/estimate/${est.id}`);
  await tid("estimate-screen-sections-sign").first().click();
  const pad = tid("signature-pad").last();
  await pad.waitFor({ timeout: 8000 });
  await pad.scrollIntoViewIfNeeded();

  // the page's scroll: the nearest ancestor of the pad that scrolls (overflow-y auto / scroll) — read by the pad's testID
  const overflow = () =>
    p.evaluate(() => {
      const pads = [...document.querySelectorAll('[data-testid="signature-pad"]')].filter((e) => e.offsetParent !== null);
      for (let el = pads[pads.length - 1]?.parentElement; el; el = el.parentElement) {
        if (el.getAttribute("data-scroll-owner") === "1") return getComputedStyle(el).overflowY;
      }
      return null;
    });
  // mark the scroll that owns the pad before the stroke (it is the one that scrolls now)
  const marked = await p.evaluate(() => {
    const pads = [...document.querySelectorAll('[data-testid="signature-pad"]')].filter((e) => e.offsetParent !== null);
    for (let el = pads[pads.length - 1]?.parentElement; el; el = el.parentElement) {
      const o = getComputedStyle(el).overflowY;
      if (o === "auto" || o === "scroll") {
        el.setAttribute("data-scroll-owner", "1");
        return o;
      }
    }
    return null;
  });
  h.expect(!!marked, `the pad stands in a page that scrolls (${marked})`);

  const bb = await pad.boundingBox();
  await p.mouse.move(bb.x + 30, bb.y + bb.height / 2);
  await p.mouse.down();
  for (let i = 0; i < 8; i++) await p.mouse.move(bb.x + 30 + i * 14, bb.y + bb.height / 2 - (i % 2 ? 20 : -20));
  // while the finger is on the field: the page does not scroll
  await p.waitForFunction(() => getComputedStyle(document.querySelector('[data-scroll-owner="1"]')).overflowY === "hidden", null, { timeout: 3000 });
  h.expect((await overflow()) === "hidden", "while drawing: the page's scroll is off");
  await p.mouse.up();
  // lifted: the page scrolls again
  await p.waitForFunction(() => getComputedStyle(document.querySelector('[data-scroll-owner="1"]')).overflowY !== "hidden", null, { timeout: 3000 });
  h.expect((await overflow()) !== "hidden", "after the stroke: the page scrolls again");
  // the stroke is on the pad: «Отменить штрих» shows once there is one
  await tid("signature-undo").first().waitFor({ timeout: 3000 });
  await h.shot(1);
};
