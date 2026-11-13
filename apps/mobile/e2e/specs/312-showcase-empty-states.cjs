/**
 * e2e 312 — the empty states in the showcase (DS §13, Н-65), every view, by testID: all five are there with their words;
 * «Сбросить фильтр», «Найдено во «Все» · 3 → Показать» and the way back from «not found» each answer; «Страницы нет» leads home.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const last = async () => (await vis("showcase-state-pressed").innerText()).replace(/\s+/g, " ");
  await h.go("/settings/design-system/notices");
  await vis("showcase-states").waitFor({ timeout: 8000 });
  for (const [id, re] of [
    ["showcase-state-none", null],
    ["showcase-state-filter", null],
    ["showcase-state-search", null],
    ["showcase-state-notfound", null],
    ["showcase-state-page", null],
  ]) await vis(id).waitFor({ timeout: 3000 });
  const text = (await vis("showcase-states").innerText()).replace(/\s+/g, " ");
  for (const w of ["Смет пока нет", "В этом отборе пусто", "Ничего не нашлось по «Roof»", "Смета не найдена", "Страницы нет"]) h.expect(text.includes(w), `says: ${w}`);
  await vis("showcase-state-filter-reset").getByRole("button").click();
  h.expect(/Сбросить фильтр/.test(await last()), `reset answers: ${await last()}`);
  await vis("showcase-state-search-all").getByRole("button").click();
  h.expect(/Найдено во «Все» · 3/.test(await last()), `show-in-all answers: ${await last()}`);
  await vis("showcase-state-notfound-back").getByRole("button").click();
  h.expect(/К списку смет/.test(await last()), `way back answers: ${await last()}`);
  await vis("showcase-state-page-home").getByRole("button").click();
  await p.waitForURL((u) => /\/today/.test(u.pathname), { timeout: 8000 });
};
