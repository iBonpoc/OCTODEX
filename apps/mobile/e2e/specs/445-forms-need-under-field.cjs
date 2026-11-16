/**
 * e2e 445 — what a form still misses stands under the field itself, and the screen scrolls to it (DS §11 п.3–4, #1728 PR-3c),
 * the director, every view, by testID:
 * - «Чем вы занимаетесь?» (/auth/trade): «Продолжить» with nothing chosen — «Выберите направление или впишите своё» under the
 *   directions (`field-trade-error`), the directions in view, the step stays; a direction picked — the words go;
 * - a new catalog item: «Сохранить» from the bottom of the page — «Укажите название» under the name, the name in view, nothing saved;
 *   a material — under the name AND under the supplier's price at once; a kit — under «Добавить позицию»;
 *   no general warning at the button any more (`catalog-need`);
 * - the scroll REALLY goes to the first missing field (a short window, the page scrolled to its bottom first): the field is wholly
 *   in view and near the top — on these two forms and on «Новый лид» (the form's hook sits above its <Screen>: the screen's scroll
 *   comes to it from the fields, `FieldBinding.attach`; before, nothing scrolled);
 * - both forms stand in the form column (`<Screen form>`, DS §12.3): a field is at most 560 wide and still fills the phone
 *   (the column of the other forms — e2e 440).
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  /** the words stand right under the field: below its top, at most a few points under its bottom, on its left line */
  const under = async (id) => {
    const err = await vis(`${id}-error`).boundingBox();
    const box = await vis(id).boundingBox();
    return err.y > box.y + 10 && err.y - (box.y + box.height) <= 12 && Math.abs(err.x - box.x) <= 2;
  };
  /** the form column: the field is as wide as the column — at most 560, the whole phone */
  const column = async (id, what) => {
    const w = (await vis(id).boundingBox()).width;
    h.expect(w <= 560.5, `${what}: the column is at most 560 wide (${w})`);
    h.expect(w >= Math.min(h.layout.width - 40, 340) - 1, `${what}: the column still fills the phone (${w})`);
  };
  /** after the main button: the field is wholly in the window and stands in its upper part (the scroll went to it) */
  const scrolledTo = async (id, what) => {
    const ok = await p.waitForFunction((tid) => {
      const e = [...document.querySelectorAll(`[data-testid="${tid}"]`)].find((x) => x.offsetParent !== null);
      if (!e) return false;
      const r = e.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight && r.top < window.innerHeight / 2;
    }, id, { timeout: 4000 }).then(() => true, () => false);
    const r = await vis(id).evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: window.innerHeight }; });
    h.expect(ok, `${what}: the screen scrolled to the field (top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)}, window ${r.h})`);
  };
  /** a window so short that the form scrolls (a phone with the keyboard, a small laptop) */
  const short = () => p.setViewportSize({ width: h.layout.width, height: 480 });
  const tall = () => p.setViewportSize({ width: h.layout.width, height: h.layout.width === 390 ? 844 : 900 });
  const toBottom = () => p.evaluate(() => document.querySelectorAll("*").forEach((e) => { if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = e.scrollHeight; }));

  // the trade step
  await h.go("/auth/trade");
  await vis("trade-step").waitFor({ timeout: 8000 });
  await column("field-trade", "/auth/trade");
  await short();
  await toBottom();
  await vis("trade-next").click();
  await vis("field-trade-error").waitFor({ timeout: 4000 });
  h.expect(/Выберите направление или впишите своё/.test(await vis("field-trade-error").innerText()), "the words say what is missing");
  h.expect(await under("field-trade"), "the words stand under the directions");
  await scrolledTo("field-trade", "/auth/trade");
  h.expect(/\/auth\/trade/.test(p.url()), "stays on the step");
  await h.shot("trade");
  await tall();
  await vis("field-trade").getByRole("checkbox").first().click();
  await p.getByTestId("field-trade-error").locator("visible=true").first().waitFor({ state: "hidden", timeout: 4000 });

  // a new service: no name
  await h.go("/catalog/new-item-445");
  await vis("catalog-save").waitFor({ timeout: 8000 });
  await column("field-name", "/catalog/[id]");
  const n0 = (await h.db()).catalog.length;
  await short();
  await toBottom();
  await vis("catalog-save").getByRole("button").click();
  await vis("field-name-error").waitFor({ timeout: 4000 });
  h.expect(/Укажите название/.test(await vis("field-name-error").innerText()), "the words under the name");
  h.expect(await under("field-name"), "the words stand under the name field");
  await scrolledTo("field-name", "/catalog/[id]");
  h.expect((await p.getByTestId("catalog-need").count()) === 0, "no general warning at the button");
  h.expect((await h.db()).catalog.length === n0, "nothing saved");
  await tall();
  await h.shot("catalog-name");
  await vis("field-name").locator("input").fill("Gutter cleaning 445");
  await p.getByTestId("field-name-error").locator("visible=true").first().waitFor({ state: "hidden", timeout: 4000 });

  // «Новый лид»: the first form on the helper (#1210) — the scroll goes to the phone
  await h.go("/lead/new");
  await vis("lead-save").waitFor({ timeout: 8000 });
  await short();
  await toBottom();
  await vis("lead-save").click();
  await vis("field-phone-error").waitFor({ timeout: 4000 });
  await scrolledTo("field-phone", "/lead/new");
  await tall();

  // a material: the name and the supplier's price, at once
  await h.go("/catalog/new-mat-445?kind=material");
  await vis("catalog-save").waitFor({ timeout: 8000 });
  await vis("catalog-save").getByRole("button").click();
  await vis("field-name-error").waitFor({ timeout: 4000 });
  await vis("field-cost-error").waitFor({ timeout: 4000 });
  h.expect(/Укажите цену поставщика/.test(await vis("field-cost-error").innerText()), "the words under the supplier's price");
  h.expect(await under("field-cost"), "the words stand under the supplier's price");
  h.expect((await h.db()).catalog.length === n0, "nothing saved");
  await h.shot("catalog-material");

  // a kit: at least one component
  await h.go("/catalog/new-kit-445?kind=kit");
  await vis("catalog-save").waitFor({ timeout: 8000 });
  await vis("field-name").locator("input").fill("Kit 445");
  await vis("catalog-save").getByRole("button").click();
  await vis("field-components-error").waitFor({ timeout: 4000 });
  h.expect(/Добавьте хотя бы одну позицию/.test(await vis("field-components-error").innerText()), "the words under «Добавить позицию»");
  h.expect((await h.db()).catalog.length === n0, "nothing saved");
};
