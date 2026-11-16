/**
 * e2e 445 — what a form still misses stands under the field itself, and the screen scrolls to it (DS §11 п.3–4, #1728 PR-3c),
 * the director, every view, by testID:
 * - «Чем вы занимаетесь?» (/auth/trade): «Продолжить» with nothing chosen — «Выберите направление или впишите своё» under the
 *   directions (`field-trade-error`), the directions in view, the step stays; a direction picked — the words go;
 * - a new catalog item: «Сохранить» from the bottom of the page — «Укажите название» under the name, the name in view, nothing saved;
 *   a material — under the name AND under the supplier's price at once; a kit — under «Добавить позицию»;
 *   no general warning at the button any more (`catalog-need`);
 * - both forms stand in the form column (`<Screen form>`, DS §12.3): a field is at most 560 wide and still fills the phone
 *   (the column of the other forms — e2e 440).
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  /** the field's box is (at least partly) inside the window */
  const inView = (id) => vis(id).evaluate((e) => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; });
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
  const toBottom = () => p.evaluate(() => document.querySelectorAll("*").forEach((e) => { if (e.scrollHeight > e.clientHeight + 4) e.scrollTop = e.scrollHeight; }));

  // the trade step
  await h.go("/auth/trade");
  await vis("trade-step").waitFor({ timeout: 8000 });
  await column("field-trade", "/auth/trade");
  await toBottom();
  await vis("trade-next").click();
  await vis("field-trade-error").waitFor({ timeout: 4000 });
  h.expect(/Выберите направление или впишите своё/.test(await vis("field-trade-error").innerText()), "the words say what is missing");
  h.expect(await under("field-trade"), "the words stand under the directions");
  await p.waitForTimeout(600); // the smooth scroll (reduced motion: at once)
  h.expect(await inView("field-trade"), "the directions are in view");
  h.expect(/\/auth\/trade/.test(p.url()), "stays on the step");
  await h.shot("trade");
  await vis("field-trade").getByRole("checkbox").first().click();
  await p.getByTestId("field-trade-error").locator("visible=true").first().waitFor({ state: "hidden", timeout: 4000 });

  // a new service: no name
  await h.go("/catalog/new-item-445");
  await vis("catalog-save").waitFor({ timeout: 8000 });
  await column("field-name", "/catalog/[id]");
  const n0 = (await h.db()).catalog.length;
  await toBottom();
  await vis("catalog-save").getByRole("button").click();
  await vis("field-name-error").waitFor({ timeout: 4000 });
  h.expect(/Укажите название/.test(await vis("field-name-error").innerText()), "the words under the name");
  h.expect(await under("field-name"), "the words stand under the name field");
  await p.waitForTimeout(600);
  h.expect(await inView("field-name"), "the name is in view");
  h.expect((await p.getByTestId("catalog-need").count()) === 0, "no general warning at the button");
  h.expect((await h.db()).catalog.length === n0, "nothing saved");
  await h.shot("catalog-name");
  await vis("field-name").locator("input").fill("Gutter cleaning 445");
  await p.getByTestId("field-name-error").locator("visible=true").first().waitFor({ state: "hidden", timeout: 4000 });

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
