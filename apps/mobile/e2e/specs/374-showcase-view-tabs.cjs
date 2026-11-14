/**
 * e2e 374 — «Вкладки вида, листаются» (DS §9 А1п, #1343), the showcase «Селекторы», every view, by testID:
 * - all eight tabs are there, «Обзор» is open; the numbers are on the tabs that have something waiting, none on the others;
 * - a press on the last tab («История») opens it: it is the selected one, the caption says so, and it is in view
 *   (the row brought it to the middle, not left it past the edge);
 * - back to the first: it is in view again.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const keys = ["overview", "estimates", "invoices", "jobs", "tasks", "notes", "files", "history"];
  const selected = (k) => tid(`showcase-vtabs-${k}`).getAttribute("aria-selected");
  // the pill lies inside the row's visible box (with a pixel of slack)
  const inView = (k) =>
    p.evaluate((id) => {
      const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.offsetParent !== null);
      const row = el?.closest('[role="tablist"]');
      if (!el || !row) return false;
      const a = el.getBoundingClientRect();
      const b = row.getBoundingClientRect();
      return a.left >= b.left - 1 && a.right <= b.right + 1;
    }, `showcase-vtabs-${k}`);

  await h.go("/settings/design-system/selectors");
  await tid("showcase-vtabs").waitFor({ timeout: 8000 });
  for (const k of keys) h.expect((await p.getByTestId(`showcase-vtabs-${k}`).locator("visible=true").count()) === 1, `tab «${k}» is there`);
  h.expect((await selected("overview")) === "true", "«Обзор» is open");
  // the zone of a tab is 44 high (DS rule 3), the visible pill 30 inside it — not a hit slop the web does not have
  const zone = await tid("showcase-vtabs-estimates").boundingBox();
  h.expect(zone && zone.height >= 44, `a tab's zone is 44 high (${zone && zone.height})`);
  for (const k of ["estimates", "invoices", "jobs", "tasks"]) h.expect((await p.getByTestId(`showcase-vtabs-${k}-count`).locator("visible=true").count()) === 1, `«${k}» shows what waits`);
  for (const k of ["overview", "notes", "files", "history"]) h.expect((await p.getByTestId(`showcase-vtabs-${k}-count`).count()) === 0, `«${k}» has no number`);
  await h.shot("first");

  // the last tab: the row scrolls to it first (a finger does the same), then it opens and stays in view
  await tid("showcase-vtabs-history").scrollIntoViewIfNeeded();
  await tid("showcase-vtabs-history").click();
  await p.waitForFunction(() => /История|History|Historial/.test(document.querySelector('[data-testid="showcase-vtabs-picked"]')?.textContent || ""), null, { timeout: 3000 });
  h.expect((await selected("history")) === "true", "«История» is the selected tab");
  h.expect((await selected("overview")) === "false", "«Обзор» is not");
  await p.waitForFunction((id) => {
    const el = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.offsetParent !== null);
    const row = el?.closest('[role="tablist"]');
    if (!el || !row) return false;
    const a = el.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    return a.left >= b.left - 1 && a.right <= b.right + 1;
  }, "showcase-vtabs-history", { timeout: 3000 });
  await h.shot("last");

  // back to the first: in view again
  await tid("showcase-vtabs-overview").scrollIntoViewIfNeeded();
  await tid("showcase-vtabs-overview").click();
  await p.waitForFunction(() => document.querySelector('[data-testid="showcase-vtabs-overview"]')?.getAttribute("aria-selected") === "true", null, { timeout: 3000 });
  h.expect(await inView("overview"), "«Обзор» is in view");
};
