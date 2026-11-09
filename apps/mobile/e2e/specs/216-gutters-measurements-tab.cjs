/**
 * e2e 216 — вкладка «Замеры» (основатель 09.11: «делай»; docs/specs/33-gutters-canvas.md П20.24). Every view.
 * - the module off: no «Замеры» — not in the bottom tabs (phone), not in the side menu (820/1280);
 * - on: «Замеры» is there (before «Ещё» on the phone), the core's tabs stay; pressed → the list, lit as the current one.
 * Finds things by testID; waits on what it checks.
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const item = () => tid(wide ? "side-module-gutters-list" : "tab-module-gutters-list");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };

  await h.go("/today");
  await tid(wide ? "side-nav" : "tab-bar").waitFor({ timeout: 8000 });
  h.expect((await item().count()) === 0, "off: no «Замеры»");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await h.go("/today");
  await waitFor(async () => (await item().count()) === 1, "on: «Замеры» is there");
  if (!wide) {
    const ids = await tid("tab-bar").locator('[data-testid^="tab-"]').evaluateAll((xs) => xs.map((x) => x.getAttribute("data-testid")));
    h.expect(JSON.stringify(ids) === JSON.stringify(["tab-home", "tab-plan", "tab-messages", "tab-clients", "tab-module-gutters-list", "tab-more"]), `the core's tabs stay, «Замеры» before «Ещё» (${ids.join(", ")})`);
  }
  // six tabs at 390: no name cut short, in RU, EN, ES («Сообщения» → «Чаты» under the tab; the director 09.11)
  if (!wide) {
    for (const lang of ["ru", "en", "es"]) {
      if (lang !== "ru") {
        await p.evaluate((l) => localStorage.setItem("octo.lang.v1", JSON.stringify(l)), lang);
        await p.reload();
        await tid("tab-bar").waitFor({ timeout: 8000 });
      }
      await waitFor(async () => (await tid("tab-bar").locator('[data-testid^="tab-"]').count()) === 6, `${lang}: six tabs`);
      const cut = await tid("tab-bar").evaluate((bar) =>
        [...bar.querySelectorAll('[data-testid^="tab-"] div[dir="auto"], [data-testid^="tab-"] [class*="Text"]')]
          .filter((t) => t.textContent && t.scrollWidth > t.clientWidth + 1)
          .map((t) => t.textContent),
      );
      h.expect(cut.length === 0, `${lang}: no tab name cut short (${cut.join(", ")})`);
      if (lang === "ru") await h.shot("tabs-ru");
    }
    await p.evaluate(() => localStorage.setItem("octo.lang.v1", JSON.stringify("ru")));
    await p.reload();
    await tid("tab-bar").waitFor({ timeout: 8000 });
  }
  await item().click();
  await p.waitForURL(/\/module\/gutters\/list/, { timeout: 5000 });
  // the tab: aria-selected; the side menu: aria-current="page" (on the item or the element that carries the testID)
  const lit = async () => {
    const el = item();
    const a = (await el.getAttribute("aria-selected")) === "true" || (await el.getAttribute("aria-current")) === "page";
    return a || (await el.locator('[aria-selected="true"], [aria-current="page"]').count()) > 0;
  };
  await waitFor(lit, "lit as the current one");
  await h.shot("tab");
};
