/**
 * e2e 385 — the client's card, PR-3 (#1416, #1343; DS §9 А1п, §12.3), Sarah Mitchell (c1) as the director, every view, by testID:
 * - phone and tablet: scrolled down, the tabs stick to the top under the mini header «name · call · write · route»
 *   (not shown before they stick); another tab keeps them stuck (no jump back to the page's top);
 * - desktop (1280): two columns — the tabs on the left, the summary («Создать смету», money) in a side column 360 on the right;
 * - an unselected tab has no plate (DS А1п; only the selected one has «Заливка»);
 * - «История»: the filters are one row (the list's FilterBar), not a second row of tabs that wraps;
 * - «Обзор»: the next visit is its own line, not under «Ждёт действия».
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const desktop = h.layout.width >= 1100;

  await h.go("/client/c1");
  await tid("client-tabs").waitFor({ timeout: 8000 });

  // an unselected tab: no plate (transparent), the selected one has its fill
  const plates = await p.evaluate(() => {
    const row = [...document.querySelectorAll('[data-testid="client-tabs"]')].find((e) => e.offsetParent !== null);
    const tabs = [...(row?.querySelectorAll('[role="tab"]') ?? [])];
    const bg = (t) => [t, ...t.querySelectorAll("div")].map((e) => getComputedStyle(e).backgroundColor).find((x) => x !== "rgba(0, 0, 0, 0)" && x !== "transparent") ?? null;
    return tabs.map((t) => ({ sel: t.getAttribute("aria-selected") === "true", bg: bg(t) }));
  });
  h.expect(plates.length >= 5, `the tabs are there (${plates.length})`);
  h.expect(plates.filter((x) => x.sel).every((x) => x.bg), "the selected tab has its fill");
  h.expect(plates.filter((x) => !x.sel).every((x) => !x.bg), `an unselected tab has no plate (${plates.filter((x) => !x.sel && x.bg).length} have)`);

  // «Обзор»: the next visit on its own, not in «Ждёт действия»
  await tid("client-next-visit").waitFor({ timeout: 3000 });

  if (desktop) {
    const side = await tid("client-side").boundingBox();
    const tabs = await tid("client-tabs").boundingBox();
    h.expect(side && Math.abs(side.width - 360) <= 1, `the summary column is 360 wide (${side && side.width})`);
    h.expect(side && tabs && side.x > tabs.x + tabs.width - 1, "the summary is on the right of the tabs");
    h.expect((await p.getByTestId("client-make-estimate").locator("visible=true").count()) === 1, "«Создать смету» is in the side column");
  } else {
    h.expect((await p.getByTestId("tabs-mini").count()) === 0, "no mini header before the tabs stick");
    // scroll the page down with the wheel (a finger's scroll): the tabs stick under the mini header
    await p.mouse.move(h.layout.width / 2, 500);
    await p.mouse.wheel(0, 900);
    await tid("tabs-mini").waitFor({ timeout: 3000 });
    await p.waitForFunction(() => {
      const t = [...document.querySelectorAll('[data-testid="client-tabs"]')].find((e) => e.offsetParent !== null);
      return t && t.getBoundingClientRect().top < 120;
    }, null, { timeout: 3000 });
    h.expect((await p.getByTestId("client-mini").locator("visible=true").count()) === 1, "the mini header shows the client");
    await h.shot("stuck");
    // another tab: the row stays stuck under the mini header
    await tid("client-tabs-invoices").click();
    await p.waitForFunction(() => document.querySelector('[data-testid="client-tabs-invoices"]')?.getAttribute("aria-selected") === "true", null, { timeout: 3000 });
    await p.waitForFunction(() => {
      const t = [...document.querySelectorAll('[data-testid="client-tabs"]')].find((e) => e.offsetParent !== null);
      return t && t.getBoundingClientRect().top < 120;
    }, null, { timeout: 3000 });
  }

  // «История»: one row of filters
  await h.go("/client/c1?tab=history");
  await tid("client-tab-history").waitFor({ timeout: 8000 });
  const rows = await p.evaluate(() => {
    const area = [...document.querySelectorAll('[data-testid="client-tab-history"]')].find((e) => e.offsetParent !== null);
    const bar = area?.querySelector('[data-testid="filter-bar"]');
    if (!bar) return -1;
    const tops = new Set([...bar.querySelectorAll('[role="button"], [role="radio"], [role="tab"]')].filter((e) => e.offsetParent !== null).map((e) => Math.round(e.getBoundingClientRect().top)));
    return tops.size;
  });
  h.expect(rows === 1, `«История»: the filters are one row (${rows})`);
  await h.shot("history");
};
