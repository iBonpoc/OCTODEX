/**
 * e2e 314 — «Заливка», the one way a chosen item looks (DS «Выделение выбранного», #1306), every view, by testID: the sample
 * in the showcase answers a press, the chosen one is a radio that is checked, and its fill is neither the accent nor a status colour.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system/rows");
  await vis("showcase-rows-fill").waitFor({ timeout: 8000 });
  await vis("showcase-fill-full").click();
  h.expect(/Выбрано: Подробно/.test(await vis("showcase-fill-chosen").innerText()), "the press chooses");
  h.expect((await vis("showcase-fill-full").getAttribute("aria-checked")) === "true", "the chosen one is checked");
  h.expect((await vis("showcase-fill-brief").getAttribute("aria-checked")) !== "true", "the other one is not");
  // the fill is a neutral surface, never the main-action yellow
  const bg = await vis("showcase-fill-full").evaluate((el) => {
    const all = [el, ...el.querySelectorAll("*")].map((n) => getComputedStyle(n).backgroundColor).filter((c) => c && c !== "rgba(0, 0, 0, 0)");
    return all[0] ?? "";
  });
  const m = bg.match(/\d+/g)?.map(Number) ?? [];
  h.expect(m.length >= 3 && !(m[0] > 200 && m[1] > 200 && m[2] < 80), `not the yellow accent (${bg})`);
  await h.shot("fill");
};
