/**
 * #2455 — «Итого» over the keyboard (founder 23.11: the totals are typed right in their rows; with the keyboard up the pinned bar is
 * hidden, DS §8.9, and the new total was out of sight), every view. A phone's keyboard shrinks the browser's visual viewport — the
 * spec plays that with a stand-in `visualViewport` it moves by hand (the app reads it, `ui/keyboard.ts`). While a totals field is
 * typed in, the keyboard up: «Итого $…» stands under the row (iOS: in the keyboard's own bar — not shown by a browser, rule 27),
 * above the keys, and follows what is typed; the keyboard down — the line goes, the pinned bar comes back.
 */
const line = require("../estimateLine.cjs");
const totals = require("../estimateTotals.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await p.addInitScript(() => {
    const t = new EventTarget();
    const vv = Object.assign(t, { scale: 1, offsetTop: 0, offsetLeft: 0, width: innerWidth, height: innerHeight, pageTop: 0, pageLeft: 0 });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    window.__kb = (px) => {
      vv.height = innerHeight - px;
      vv.dispatchEvent(new Event("resize"));
    };
  });
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Roof work", 200);
  const phone = h.layout.width < 820;

  // the discount in $: the field takes the focus
  await totals.mode(h, "est-discount-row", "fixed");
  h.expect((await p.getByTestId("est-total-hint").locator("visible=true").count()) === 0, "no keyboard: no extra line (the bar shows the total)");
  if (!phone) return h.expect(true, "from 820 the totals card shows «Итого» itself");

  await p.evaluate(() => window.__kb(300));
  await tid("est-total-hint").waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("ue-save").locator("visible=true").count()) === 0, "the keyboard is up: the pinned bar is hidden");
  const read = async () => (await tid("est-total-hint").innerText()).trim();
  h.expect(/^Итого\s+\$200\.00$/.test(await read()), `the line reads the total («${await read()}»)`);
  // it follows what is typed (a $25 discount: $175.00)
  await tid("est-discount-fixed").locator("input").fill("25");
  await p.waitForFunction(() => /\$175\.00$/.test([...document.querySelectorAll('[data-testid="est-total-hint"]')].find((e) => e.offsetParent)?.textContent || ""), null, { timeout: 3000 });
  h.expect(/\$175\.00$/.test(await read()), `the line follows the typing («${await read()}»)`);
  // and stands above the keys: the page brings the field being typed in to the middle of what the keyboard leaves (a browser does it
  // by itself, the stand-in viewport does not), the line is right under the field's row
  await tid("est-discount-fixed").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const [box, keysTop] = [await tid("est-total-hint").boundingBox(), await p.evaluate(() => window.visualViewport.height)];
  h.expect(box.y >= 0 && box.y + box.height <= keysTop, `the line is above the keyboard (${Math.round(box.y + box.height)} ≤ ${Math.round(keysTop)})`);
  await h.shot("typing");

  // the keyboard goes: the line goes, the bar is back
  await tid("est-discount-fixed").locator("input").blur();
  await p.evaluate(() => window.__kb(0));
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="est-total-hint"]')].some((e) => e.offsetParent), null, { timeout: 3000 });
  // (scrolled down, the bar is its capsule — `ue-save-capsule`)
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="ue-save"], [data-testid="ue-save-capsule"]')].some((e) => e.offsetParent), null, { timeout: 3000 });
  h.expect(true, "the keyboard down: the line goes, the pinned bar is back");
};
