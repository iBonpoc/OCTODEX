/**
 * A sheet leaves like on iPhone (#1163, DS Б1), every view: «✕» and the background do not cut it away — it goes down
 * (phone) or dissolves (from 820) over several frames and only then does the owner close it; the background fades with it.
 * Sampled on the page: the sheet's position / opacity and the background's opacity between the press and the end.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system/windows");
  await vis("showcase-windows").waitFor({ timeout: 5000 });

  // sample the open sheet and its background in the page while it leaves
  const sampled = async (close) => {
    await vis("showcase-sheet-fit").getByRole("button").first().click();
    const sheet = p.locator('[aria-modal="true"]').last();
    await sheet.waitFor({ timeout: 3000 });
    await p.getByTestId("sheet-title").locator("visible=true").first().waitFor({ timeout: 3000 });
    await p.evaluate(() => {
      const el = [...document.querySelectorAll('[data-testid="sheet-panel"]')].pop();
      const sc = [...document.querySelectorAll('[data-testid="sheet-scrim"]')].pop();
      const box = () => el.getBoundingClientRect();
      const top0 = box().top;
      window.__leave = { top0, tops: [], ops: [], done: false };
      const tick = () => {
        if (!document.body.contains(el)) { window.__leave.done = true; return; }
        window.__leave.tops.push(Math.round(box().top - top0));
        window.__leave.ops.push(Number(getComputedStyle(el).opacity)); (window.__leave.sc = window.__leave.sc || []).push(Number(getComputedStyle(sc).opacity));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await close();
    await p.waitForFunction(() => window.__leave && window.__leave.done, null, { timeout: 5000 });
    return p.evaluate(() => window.__leave);
  };
  const moved = (r) => (new Set(r.tops).size >= 3 || new Set(r.ops.map((o) => Math.round(o * 20))).size >= 3) && new Set((r.sc || []).map((o) => Math.round(o * 20))).size >= 3;

  const check = async (label) => {
  const byX = await sampled(() => p.getByRole("button", { name: "Закрыть", exact: true }).locator("visible=true").last().click());
  h.expect(moved(byX), `${label} «✕»: the sheet goes over several frames (tops ${byX.tops.length ? byX.tops.slice(0, 12).join(",") : "none"}; opacity ${byX.ops.slice(0, 8).join(",")}; scrim ${(byX.sc || []).slice(0, 8).join(",")})`);

  const byEsc = await sampled(() => pressEscUntilClosed(p, p.getByTestId("sheet-title").locator("visible=true")));
  h.expect(byEsc.tops.length >= 1 || byEsc.done, `${label} Esc: the sheet leaves and is gone`);

  // it is gone at the end — the owner closed it
  h.expect((await p.locator('[aria-modal="true"]').filter({ has: p.getByTestId("sheet-title") }).count()) === 0, `${label}: closed at the end`);
  };
  await check("reduce motion (the runner's setting): a dissolve");
  // the real motion: the page is loaded again with the setting off
  await p.emulateMedia({ reducedMotion: "no-preference" });
  await h.go("/settings/design-system/windows");
  await vis("showcase-windows").waitFor({ timeout: 5000 });
  await check("motion on: goes down");
};
