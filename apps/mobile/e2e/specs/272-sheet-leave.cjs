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

  // the two ways a sheet leaves: the owner asked first and the sheet stays while it goes out (web, Android), or the sheet
  // goes out first and the owner is asked after (iOS) — each is run on the web by a flag
  const suite = async (mode) => {
    await h.go("/settings/design-system/windows");
    await vis("showcase-windows").waitFor({ timeout: 5000 });
    await p.evaluate((m) => { globalThis.__octoSheetLeave = m; }, mode);
    await check(`${mode}: reduce motion (the runner's setting): a dissolve`);

    // the owner empties its data when it closes: the sheet goes out with what it showed (its height and title stay)
    await vis("showcase-sheet-empties").getByRole("button").first().click();
    await p.getByTestId("sheet-title").locator("visible=true").first().waitFor({ timeout: 3000 });
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('[data-testid="sheet-panel"]')].pop();
      const ti = [...document.querySelectorAll('[data-testid="sheet-title"]')].pop();
      window.__empt = { hs: [], titles: [], done: false };
      const tick = () => {
        if (!document.body.contains(el)) { window.__empt.done = true; return; }
        window.__empt.hs.push(Math.round(el.getBoundingClientRect().height));
        window.__empt.titles.push(ti.textContent);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await vis("sheet-close").click();
    await p.waitForFunction(() => window.__empt && window.__empt.done, null, { timeout: 5000 });
    const emp = await p.evaluate(() => window.__empt);
    h.expect(new Set(emp.hs).size === 1 && emp.hs.length >= 2, `the sheet does not collapse on the way out (heights ${[...new Set(emp.hs)]})`);
    h.expect(new Set(emp.titles).size === 1 && emp.titles[0] === "Карточка работы", `…nor change its title (${[...new Set(emp.titles)]})`);

    if (mode === "after") {
      // a tap under the leaving sheet works at once (web: the layer lets it through) — no waiting for the sheet to be gone
      await openSheet("fit");
      await vis("sheet-close").click();
      // (a click by Playwright waits for the target to be free — so ask the page what is under the finger right now)
      const under = await p.evaluate(() => {
        const b = [...document.querySelectorAll('[data-testid="showcase-sheet-medium"] [role="button"]')].find((e) => e.getBoundingClientRect().height > 0);
        const r = b.getBoundingClientRect();
        const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return !!e && !!e.closest('[data-testid="showcase-sheet-medium"]');
      });
      h.expect(under, "the leaving sheet takes no tap: what is under it is under the finger at once");
      await vis("showcase-sheet-medium").getByRole("button").first().click();
      await p.getByTestId("sheet-title").filter({ hasText: "Шторка половинная" }).locator("visible=true").first().waitFor({ timeout: 3000 });
      await vis("sheet-close").click();
      await gone("the second sheet closes too");

    }

    // a chain: the first sheet's button closes it and opens the next in the same moment — the next shows and takes taps
    const chain = async (what, next = "showcase-chain-next", toTitle = "Шаг 2") => {
      await vis("showcase-sheet-chainA").getByRole("button").first().click();
      await p.getByTestId("sheet-title").filter({ hasText: "Шаг 1" }).locator("visible=true").first().waitFor({ timeout: 3000 });
      // count the sheets on the screen at every frame from the press to the end: with the gate they never overlap
      await p.evaluate(() => {
        window.__chain = { max: 0, frames: 0, stop: false };
        const tick = () => {
          window.__chain.max = Math.max(window.__chain.max, document.querySelectorAll('[data-testid="sheet-panel"]').length);
          window.__chain.frames++;
          if (!window.__chain.stop) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await vis(next).getByRole("button").first().click();
      await p.getByTestId("sheet-title").filter({ hasText: toTitle }).locator("visible=true").first().waitFor({ timeout: 5000 });
      const firstGone = await p.getByTestId("sheet-title").filter({ hasText: "Шаг 1" }).waitFor({ state: "detached", timeout: 1000 }).then(() => true, () => false);
      const seen = await p.evaluate(() => { window.__chain.stop = true; return window.__chain; });
      seen.firstGone = firstGone;
      await vis("sheet-close").click();
      await gone(`${what}: the second sheet closes too`);
      return seen;
    };
    const chained = await chain(`${mode} chain`);
    // iOS way: the owner's own close cuts, so the next sheet never meets a Modal that is going out — never two at once
    // (two sheets can sit in the DOM for the one frame in which the page swaps them: what counts is that the first is gone at once)
    if (mode === "before") h.expect(chained.firstGone, "the chain: the first sheet is gone as soon as the next shows");
    // the next sheet mounted by the owner's condition and recreated at each opening (a held wrapper)
    const chainedC = await chain(`${mode} chain C`, "showcase-chain-next-c", "Шаг 3");
    if (mode === "before") h.expect(chainedC.firstGone, "the chain, the next sheet recreated: the first is gone as soon as the next shows");

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
    const inPlace = () => p.evaluate(() => [document.querySelector('[data-testid="sheet-panel"]'), document.querySelector('[data-testid="sheet-scrim"]')].map((e) => Number(getComputedStyle(e).opacity)));
    await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="sheet-panel"],[data-testid="sheet-scrim"]')].every((e) => Number(getComputedStyle(e).opacity) === 1), null, { timeout: 3000 });
    h.expect((await inPlace()).every((o) => o === 1), "…fully visible (the sheet and the background)");
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
  await suite("after");
  await suite("before");
};
