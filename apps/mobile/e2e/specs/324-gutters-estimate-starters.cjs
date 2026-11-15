/**
 * e2e 324 — #1323: the Gutters module's starter estimates («Чистка желобов», «Только guards», «Замена желобов») on «Шаблоны смет»:
 * with the module on there are three; an EMPTY price list adds none (#1336); «Создать позиции сразу» makes the test price-list items; adding «Чистка» takes the TEST
 * price of the price list's item (placeholder) — not a number from the code; the starter is not offered again. Every view.
 * Finds things by testID and the saved data; waits on what it checks (no pauses).
 */
const tidOf = (p) => (id) => p.getByTestId(id).locator("visible=true");

exports.run = async (h) => {
  const p = h.page;
  const tid = tidOf(p);
  /** waits in the page on the saved data of the phone's copy: no fixed pauses */
  const waitDb = (fn, what, arg = null) => p.waitForFunction(([src, a]) => { const d = (JSON.parse(localStorage.getItem("octo.db.v5") || "null") || {}).db; return !!d && new Function("d", "a", `return (${src})(d, a)`)(d, a); }, [fn.toString(), arg], { timeout: 9000 }).catch(() => h.expect(false, what));
  const db = () => h.db();

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitDb((d) => !!d.company?.modules?.gutters?.enabled, "Gutters on");

  // #1336: an EMPTY price list — the starter is not added (every line would be $0 and unlinked, and it would never be offered again): the way is said
  await h.go("/estimate/templates");
  await tid("est-starter-gutters-clean").waitFor({ timeout: 8000 });
  await tid("est-starter-gutters-clean").getByRole("button", { name: /Добавить/ }).click();
  await tid("toast-text").waitFor({ timeout: 5000 });
  h.expect(/Сначала создайте позиции прайса/.test(await tid("toast-text").innerText()), "an empty price list: «Сначала создайте позиции прайса…»");
  h.expect(((await db()).estimateTemplates ?? []).length === 0, "…and nothing was saved");
  h.expect((await tid("est-starter-gutters-clean").count()) === 1, "…and the starter is still offered");

  // the price list: the test items are made (labor «Чистка», «Промывка», guards among them)
  await h.go("/module/gutters/prices");
  await tid("gpr-missing-n-action").getByRole("button").click();
  await waitDb((d) => d.catalog.some((it) => it.placeholder && it.attributes?.work === "cleaning"), "the test labor item of the cleaning is made");
  const clean = (await db()).catalog.find((it) => it.attributes?.work === "cleaning");
  h.expect(clean.placeholder === true && clean.priceCents > 0, "a test item: marked, with a test price");

  // «Шаблоны смет»: three starters of the module
  await h.go("/estimate/templates");
  for (const k of ["clean", "guards", "replace"]) await tid(`est-starter-gutters-${k}`).waitFor({ timeout: 8000 });
  h.expect(/Чистка желобов/.test(await tid("est-starter-gutters-clean").innerText()), "«Чистка желобов»");
  h.expect(/Только guards/.test(await tid("est-starter-gutters-guards").innerText()), "«Только guards»");
  h.expect(/Замена желобов/.test(await tid("est-starter-gutters-replace").innerText()), "«Замена желобов»");
  await h.shot("starters");

  // «Отменить» on the toast of the add (#1336): the template goes and the starter is offered again. The toast ignores a tap in its first
  // toastArmMs (src/ui/toastArm.ts: the second tap of a double tap is not «Отменить») — a tap that came too early was lost without a word and
  // the template stayed (the stop on main 04:26, e2e 324 @390 dark): tap again until the toast has taken it, never a fixed pause
  await tid("est-starter-gutters-guards").getByRole("button", { name: /Добавить/ }).click();
  await waitDb((d) => (d.estimateTemplates ?? []).length === 1, "the guards template is saved");
  const gone = async () => ((await db()).estimateTemplates ?? []).filter((x) => !x.deletedAt).length === 0;
  for (let i = 0; i < 60 && !(await gone()); i++) {
    if (await tid("toast-undo").count()) await tid("toast-undo").click({ timeout: 2000 }).catch(() => {});
    if (!(await gone())) await p.evaluate(() => new Promise((r) => { let n = 9; const f = () => (--n ? requestAnimationFrame(f) : r(true)); requestAnimationFrame(f); })); // a few frames, not a pause
  }
  h.expect(await gone(), "«Отменить»: the guards template is taken back");
  await tid("est-starter-gutters-guards").waitFor({ timeout: 8000 });

  // «Чистка»: the company's own template; the line's price is the price list's item's price
  await tid("est-starter-gutters-clean").getByRole("button", { name: /Добавить/ }).click();
  await waitDb((d) => (d.estimateTemplates ?? []).length === 1, "the template is saved");
  const tpl = (await db()).estimateTemplates[0];
  const first = tpl.doc.options[0].lines[0];
  h.expect(first.catalogItemId === clean.id && first.unitPriceCents === clean.priceCents, `the line takes the price-list item's price (${first.unitPriceCents} = ${clean.priceCents})`);
  h.expect(first.quantity === "100" || Number(first.quantity) === 100, `a start quantity to change (${first.quantity})`);
  h.expect(tpl.doc.options[0].lines.every((l) => l.unitPriceCents > 0), "every line of the cleaning has a price (no «проверьте цену»)");
  // not offered again
  await tid(`est-tpl-${tpl.id}`).waitFor({ timeout: 8000 });
  h.expect((await tid("est-starter-gutters-clean").count()) === 0, "the added starter is not offered again");
  h.expect((await tid("est-starter-gutters-guards").count()) === 1, "the others still are");
  await h.shot("added");

};
