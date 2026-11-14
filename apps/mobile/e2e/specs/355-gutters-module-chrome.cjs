/**
 * e2e 355 — экраны модуля Gutters и обвязка приложения (#1426 группа D, дизайн-аудит 14.11; DS Б11, §12.2, §12.10). Every view.
 * - the module's lists and cards keep the app's chrome: on the phone the bottom tabs are over «Замеры», «Просмотр замера»,
 *   «Настройки» and «Цены»; from 820 the side menu is there;
 * - «Замеры» opened as a tab is a root: no «‹ Назад» over it;
 * - the canvas takes the whole screen: no bottom tabs on the phone, no side menu from 820.
 * Finds things by testID; waits on what it checks.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const wide = h.layout.width > 390;
  /** the app's chrome of this view: the side menu from 820, the bottom tabs on the phone */
  const chrome = () => tid(wide ? "side-nav" : "tab-bar");
  const until = async (ok, what) => {
    for (let i = 0; i < 200; i++) {
      if (await ok()) return h.expect(true, what);
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    }
    h.expect(false, what);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });

  // the module's lists and cards: the chrome is there
  for (const [path, mark] of [["/module/gutters/list", "measurements-empty"], ["/module/gutters/view?m=nope", "not-found"], ["/module/gutters/settings", "gset-screen"], ["/module/gutters/prices", "gpr-screen"]]) {
    await h.go(path);
    await tid(mark).waitFor({ timeout: 8000 });
    await chrome().first().waitFor({ timeout: 5000 });
    h.expect(true, `${path}: the app's ${wide ? "side menu" : "bottom tabs"} are there`);
  }

  // «Замеры» is a tab: a root, no «‹ Назад»
  await h.go("/module/gutters/list");
  await tid("measurements-empty").waitFor({ timeout: 8000 });
  h.expect((await p.getByRole("button", { name: "Назад", exact: true }).locator("visible=true").count()) === 0, "«Замеры» as a tab has no «‹ Назад»");
  await h.shot("list");

  // the canvas: the whole screen — no tabs, no side menu
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await until(async () => (await chrome().count()) === 0, `the canvas: no ${wide ? "side menu" : "bottom tabs"}`);
  await h.shot("draw");
  // back to a list: the chrome comes back (the canvas's hiding ends with it)
  await h.go("/module/gutters/list");
  await tid("measurements-empty").waitFor({ timeout: 8000 });
  await chrome().first().waitFor({ timeout: 5000 });
};
