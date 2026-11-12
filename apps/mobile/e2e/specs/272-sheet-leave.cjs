/**
 * A sheet leaves like on iPhone (#1163, DS Б1), every view:
 * - «✕» and Esc do not cut it away — it goes down (phone) or dissolves (from 820, reduce motion) over several frames,
 *   the background fades with it; the owner is asked once;
 * - a sheet whose owner will not close it (a key to enter, a refund under way) comes straight back, asked once per press;
 * - on the phone a short slow pull springs back, a long one takes the sheet away.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const { settle } = require("../settle.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const panel = () => p.getByTestId("sheet-panel").locator("visible=true").last();
  const top = async () => Math.round((await panel().boundingBox()).y);
  const frame = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  const openSheet = async (id) => {
    await vis(`showcase-sheet-${id}`).getByRole("button").first().click();
    await p.getByTestId("sheet-title").locator("visible=true").first().waitFor({ timeout: 3000 });
    await panel().waitFor({ timeout: 3000 });
  };
  const gone = (what) => p.waitForFunction(() => document.querySelectorAll('[data-testid="sheet-panel"]').length === 0, null, { timeout: 5000 }).then(() => true, () => false).then((ok) => h.expect(ok, what));

  // sample the open sheet and its background in the page while it leaves
  const sampled = async (close) => {
    await openSheet("fit");
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('[data-testid="sheet-panel"]')].pop();
      const sc = [...document.querySelectorAll('[data-testid="sheet-scrim"]')].pop();
      const top0 = el.getBoundingClientRect().top;
      window.__leave = { tops: [], ops: [], sc: [], done: false };
      const tick = () => {
        if (!document.body.contains(el)) { window.__leave.done = true; return; }
        window.__leave.tops.push(Math.round(el.getBoundingClientRect().top - top0));
        window.__leave.ops.push(Number(getComputedStyle(el).opacity));
        window.__leave.sc.push(Number(getComputedStyle(sc).opacity));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await close();
    await p.waitForFunction(() => window.__leave && window.__leave.done, null, { timeout: 5000 });
    return p.evaluate(() => window.__leave);
  };
  const levels = (a) => new Set(a.map((o) => Math.round(o * 20))).size;
  const moved = (r) => (new Set(r.tops).size >= 3 || levels(r.ops) >= 3) && levels(r.sc) >= 3;

  const check = async (label) => {
    const byX = await sampled(() => vis("sheet-close").click());
    h.expect(moved(byX), `${label} «✕»: over several frames (tops ${byX.tops.slice(0, 10)}; opacity ${byX.ops.slice(0, 6)}; scrim ${byX.sc.slice(0, 6)})`);
    const byEsc = await sampled(() => pressEscUntilClosed(p, p.getByTestId("sheet-title").locator("visible=true")));
    h.expect(moved(byEsc), `${label} Esc: over several frames (tops ${byEsc.tops.slice(0, 10)}; opacity ${byEsc.ops.slice(0, 6)}; scrim ${byEsc.sc.slice(0, 6)})`);
    await gone(`${label}: closed at the end`);
  };

  await h.go("/settings/design-system/windows");
  await vis("showcase-windows").waitFor({ timeout: 5000 });
  await check("reduce motion (the runner's setting): a dissolve");

  // the owner will not close it: it comes straight back, and is asked once per press
  await openSheet("stuck");
  const t0 = await top();
  const askedText = async () => Number(/(\d+)/.exec(await vis("showcase-stuck-asked").innerText())?.[1]);
  h.expect((await askedText()) === 0, "not asked yet");
  await vis("sheet-close").click();
  await p.waitForFunction((n) => /(\d+)/.exec(document.querySelector('[data-testid="showcase-stuck-asked"]')?.textContent ?? "")?.[1] === String(n), 1, { timeout: 3000 });
  h.expect((await askedText()) === 1, "«✕»: the owner is asked once");
  await p.waitForFunction((y) => Math.round(document.querySelector('[data-testid="sheet-panel"]').getBoundingClientRect().y) === y, t0, { timeout: 3000 });
  h.expect((await p.getByTestId("sheet-panel").count()) === 1, "…and the sheet is back in its place");
  await p.getByTestId("sheet-scrim").getByRole("button").first().click({ position: { x: 5, y: 5 } });
  await p.waitForFunction(() => /(\d+)/.exec(document.querySelector('[data-testid="showcase-stuck-asked"]')?.textContent ?? "")?.[1] === "2", null, { timeout: 3000 });
  await p.waitForFunction((y) => Math.round(document.querySelector('[data-testid="sheet-panel"]').getBoundingClientRect().y) === y, t0, { timeout: 3000 });
  await vis("showcase-stuck-done").getByRole("button").first().click();
  await gone("the owner closes it itself: it goes out");

  // the phone: a short slow pull springs back, a long one takes the sheet away (the pull is paced by frames: a slow finger)
  if (h.layout.width < 820) {
    const pull = async (share) => {
      const box = await p.getByLabel("Шторка", { exact: true }).last().boundingBox(); // the grabber
      const full = (await panel().boundingBox()).height;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await p.mouse.move(x, y);
      await p.mouse.down();
      for (let d = 0; d <= full * share; d += 6) {
        await p.mouse.move(x, y + d);
        await frame();
      }
      const mid = Math.round((await panel().boundingBox()).y);
      await p.mouse.up();
      return mid;
    };
    await openSheet("fit");
    const y0 = await top();
    const mid1 = await pull(0.15);
    h.expect(mid1 > y0 + 10, `short pull follows (${y0} → ${mid1})`);
    await p.waitForFunction((y) => Math.round(document.querySelector('[data-testid="sheet-panel"]').getBoundingClientRect().y) === y, y0, { timeout: 3000 });
    h.expect((await p.getByTestId("sheet-panel").count()) === 1, "a short slow pull springs back");
    // a fresh opening for the long pull (a second pull in the same opening does not follow the finger — noted in #1167)
    await vis("sheet-close").click();
    await gone("closed before the long pull");
    await openSheet("fit");
    await settle(p);
    const mid = await pull(0.7);
    h.expect(mid > y0 + 50, `the sheet follows the finger (${y0} → ${mid})`);
    await gone("a long pull takes the sheet away");
  }
};
