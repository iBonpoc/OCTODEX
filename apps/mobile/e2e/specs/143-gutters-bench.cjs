/**
 * e2e 143 — «Проверка скорости холста» модуля Gutters (docs/specs/33-gutters-canvas.md П20.3; спека 33 §9). Every view.
 * The speed check is a developer's screen (#1426, DS §12.8): Expo Go and development builds only. This build (the web export, as the
 * store build) neither offers it in «Модули» nor has its route: /module/gutters/bench is «Такого экрана у модуля нет», as an unknown
 * screen or module. The bench itself is run by the founder in Expo Go (spec 33); which builds register it — test/gutterBenchRegistry.test.ts.
 * Finds things by testID.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters").waitFor({ timeout: 5000 });
  await tid("module-gutters-settings").first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("module-gutters-bench").count()) === 0, "«Модули»: no «Проверка скорости» in this build");
  await h.go("/module/gutters/bench");
  await h.expectText(/Такого экрана у модуля нет/, "the speed check's address opens nothing in this build");
  h.expect((await p.getByTestId("bench-drawing").count()) === 0, "no bench drawing");
  await h.shot("no-bench");

  await h.go("/module/gutters/nope");
  await h.expectText(/Такого экрана у модуля нет/, "an unknown screen");
  await h.go("/module/nope/bench");
  await h.expectText(/Такого экрана у модуля нет/, "an unknown module");
};
