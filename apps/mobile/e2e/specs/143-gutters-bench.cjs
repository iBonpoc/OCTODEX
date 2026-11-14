/**
 * e2e 143 — «Проверка скорости холста» модуля Gutters (docs/specs/33-gutters-canvas.md П20.3; спека 33 §9). Every view.
 * - «Компания → Модули»: the web build does not offer «Проверка скорости» (a developer's screen: Expo Go and dev builds only,
 *   #1426); /module/gutters/bench opens by its address, without the bottom bar;
 * - the bench drawing is the founder's load: 50 lines, 40 downspouts, 150 labels; storeys by colour with «эт N»;
 * - «Начать» runs the four checks and shows each with a number and «прошло / не прошло» (icon + word); «Скопировать
 *   итог» appears. The speed thresholds are NOT checked here: the browser in CI is not a phone (the founder measures
 *   on his phones); this spec checks that the bench counts and shows;
 * - a wrong module or screen → «Такого экрана у модуля нет».
 * Finds things by testID; waits on the results by condition.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters").waitFor({ timeout: 5000 });
  h.expect(/^Не подключён$/.test((await tid("module-gutters-status").innerText()).trim()), "the module is off");
  // the speed check is a developer's screen (#1426, DS §12.8): the web build does not offer it to an owner; the route still opens it
  await tid("module-gutters-settings").first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("module-gutters-bench").count()) === 0, "«Модули»: no «Проверка скорости» for an owner of this build");
  await h.go("/module/gutters/bench");
  await tid("bench-drawing").waitFor({ timeout: 8000 });
  h.expect((await tid("tab-bar").count()) === 0, "no bottom bar over the bench");

  const svg = p.getByTestId("bench-drawing").locator("svg").first();
  const n = async (sel) => svg.locator(sel).count();
  const lines = await n("line");
  const dots = await n("circle");
  // the labels (chips); the marks have their own text inside («D1», «L») — not labels
  const labels = await n('[id^="lbl-"]');
  h.expect(lines === 50, `50 lines (${lines})`);
  h.expect(dots === 40, `40 downspouts (${dots})`);
  h.expect(labels === 150, `150 labels (${labels})`);
  const texts = await svg.locator("text").evaluateAll((ts) => ts.map((t) => t.textContent || ""));
  h.expect(texts.some((t) => /^эт [1-4]$/.test(t.trim())), "storey labels «эт N»");
  h.expect(texts.some((t) => /^\d+′( \d+″)?$/.test(t.trim())), "length labels in feet and inches");
  const strokes = new Set(await svg.locator("line").evaluateAll((ls) => ls.map((l) => l.getAttribute("stroke"))));
  h.expect(strokes.size === 4, `four storey colours (${[...strokes].join(", ")})`);
  await h.shot("before");

  await tid("bench-start").getByRole("button").click();
  await tid("bench-running").waitFor({ timeout: 5000 });
  await tid("bench-copy").waitFor({ timeout: 60_000 });
  for (const k of ["open", "pan", "drag", "tap"]) {
    const row = (await tid(`bench-${k}`).innerText()).replace(/\s+/g, " ");
    h.expect(/(прошло|не прошло)/.test(row), `${k}: a verdict (${row})`);
    const m = row.match(/(\d+) (кадров\/с|мс) · нужно (≥|<) (\d+)/);
    h.expect(!!m && Number(m[1]) > 0, `${k}: a number and the threshold (${row})`);
  }
  await h.expectText(/Пришлите итог руководителю/, "how to send it");
  await h.shot("done");

  await h.go("/module/gutters/nope");
  await h.expectText(/Такого экрана у модуля нет/, "an unknown screen");
  await h.go("/module/nope/bench");
  await h.expectText(/Такого экрана у модуля нет/, "an unknown module");
};
