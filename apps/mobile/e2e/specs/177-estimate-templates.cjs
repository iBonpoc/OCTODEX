/**
 * e2e 177 — E3 «Шаблоны смет» (docs/specs/07 §7.4, §11; S5t «Шаблон → смета»). Every view.
 * - the director: «Сохранить как шаблон» on an estimate → the template has no client, no module `source`, fresh ids;
 * - «Шаблоны смет»: the card; «Новая смета» → «С чего начать?» is skipped, the builder has the template's lines; a line
 *   linked to the catalog takes the CURRENT catalog price, a line whose item is gone keeps the template's price and is
 *   marked «нет в каталоге, проверьте цену»; saved → the estimate keeps templateId, the template counts one use;
 * - a new estimate from the client: «С чего начать?» lists «Пустая смета» and the template;
 * - archive → the card leaves the list, «Отменить» brings it back;
 * - a tech: no «Сохранить как шаблон», no rename / archive, but «Новая смета» from a template.
 * Test prices («тестовые», rule 9). By testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";
const EID = "e-e2e-177";
const ITEM = "cat-e2e-177";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 60) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const tpls = async () => ((await h.db())?.estimateTemplates ?? []);
  const role = (r) => p.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

  await h.go("/today");
  await role("director");
  const customerId = await p.evaluate(({ k, id, item }) => {
    const s = JSON.parse(localStorage.getItem(k));
    const base = s.db.estimates.find((e) => e.doc && e.customerId);
    s.db.catalog.push({ id: item, kind: "service", name: "Inspection (test)", unit: "ea", priceCents: 15000, placeholder: true });
    const line = (lid, name, x) => ({ id: lid, group: "service", name, quantity: "1", unit: "ea", unitPriceCents: 9900, ...x });
    const doc = JSON.parse(JSON.stringify(base.doc));
    doc.options = [{ ...doc.options[0], lines: [
      line("l-cat", "Inspection (test)", { catalogItemId: item }),
      line("l-gone", "Old part (test)", { catalogItemId: "cat-not-there", unitPriceCents: 700 }),
      line("l-mod", "Guard (test)", { group: "material", unitPriceCents: 1200, source: { module: "gutters", key: "k.guard" } }),
    ] }];
    s.db.estimates.push({ ...base, id, number: "EST-0177", title: "Template source", status: "sent", approval: undefined, countersign: undefined, doc });
    s.db.estimateTemplates = [];
    localStorage.setItem(k, JSON.stringify(s));
    return base.customerId;
  }, { k: DB_KEY, id: EID, item: ITEM });

  // «Сохранить как шаблон» (any status: this one is sent)
  await h.go(`/estimate/${EID}`);
  await tid("est-save-template").getByRole("button").click();
  await tid("est-tpl-save-sheet").waitFor({ timeout: 8000 });
  await tid("est-tpl-save-name").locator("input").fill("Inspection visit");
  await h.shot("save-sheet");
  await tid("est-tpl-save").getByRole("button").click();
  await waitFor(async () => (await tpls()).length === 1, "the template is saved");
  const tpl = (await tpls())[0];
  h.expect(tpl.name === "Inspection visit", "its name");
  h.expect(!("customerId" in tpl) && !("propertyId" in tpl) && !("leadId" in tpl), "no client, property or lead");
  const tl = tpl.doc.options[0].lines;
  h.expect(tl.length === 3 && !tl.some((l) => l.id.startsWith("l-")), "fresh line ids");
  h.expect(!tl.some((l) => "source" in l), "a module's line became a plain line");

  // «Шаблоны смет» → «Новая смета»
  await h.go("/estimate/templates");
  await tid(`est-tpl-${tpl.id}`).waitFor({ timeout: 8000 });
  await h.shot("list");
  await tid(`est-tpl-${tpl.id}`).click();
  await tid("est-tpl-use").getByRole("button").click();
  await p.waitForURL(new RegExp(`estimate/new\\?template=${tpl.id}`), { timeout: 8000 });
  // the same builder with the client given (no client picker over it)
  await h.go(`/estimate/new?template=${tpl.id}&customerId=${customerId}`);
  await tid("ue-save").waitFor({ timeout: 8000 });
  h.expect((await tid("est-start").count()) === 0, "a template given: no «С чего начать?»");
  // the folded rows say «$150 × 1 ea» in «Подробно» (DS §8.3, #1307 «а»; «Кратко» shows only the sum) — read them by testID
  await tid("est-row-view").getByText("Подробно", { exact: true }).click();
  await p.locator('[data-testid^="est-times-"]').first().waitFor({ timeout: 5000 });
  const times = (await p.locator('[data-testid^="est-times-"]').locator("visible=true").allInnerTexts()).join(" | ");
  h.expect(/\$150(\.00)? ×/.test(times) && !/\$99\b/.test(times), `the catalog line takes today's catalog price ($150, not $99): ${times}`);
  h.expect(/\$7(\.00)? ×/.test(times), `the gone item keeps the template's price: ${times}`);
  h.expect((await p.getByTestId(/^est-checkprice-/).locator("visible=true").count()) === 1, "one line marked «нет в каталоге, проверьте цену»");
  await h.shot("builder");

  // a new estimate from the client: «С чего начать?» → the template
  await h.go(`/estimate/new?customerId=${customerId}`);
  await tid("est-start").waitFor({ timeout: 8000 });
  h.expect((await tid("est-start-blank").count()) === 1, "«Пустая смета» first");
  await h.shot("start");
  await tid(`est-start-${tpl.id}`).click();
  await waitFor(async () => (await tid("est-start").count()) === 0, "the sheet closes");
  await tid("ue-save").getByRole("button").click();
  await waitFor(async () => ((await h.db()).estimates ?? []).some((e) => e.templateId === tpl.id), "the estimate keeps its template");
  await waitFor(async () => (await tpls())[0].uses === 1, "the template counts one use");

  // archive, «Отменить»
  await h.go("/estimate/templates");
  await tid(`est-tpl-${tpl.id}`).click();
  await tid("est-tpl-archive").getByRole("button").click();
  await waitFor(async () => !!(await tpls())[0].archivedAt, "archived");
  h.expect((await tid(`est-tpl-${tpl.id}`).count()) === 0, "the card leaves the list");
  await p.getByRole("button", { name: /Отменить|Undo|Deshacer/ }).first().click();
  await waitFor(async () => !(await tpls())[0].archivedAt, "«Отменить» brings it back");

  // a tech uses templates but does not make or change them
  await role("tech");
  await h.go(`/estimate/${EID}`);
  await tid("est-pdf").waitFor({ timeout: 8000 });
  h.expect((await tid("est-save-template").count()) === 0, "a tech: no «Сохранить как шаблон»");
  await h.go("/estimate/templates");
  await tid(`est-tpl-${tpl.id}`).click();
  await tid("est-tpl-sheet").waitFor({ timeout: 8000 });
  h.expect((await tid("est-tpl-use").count()) === 1, "a tech: «Новая смета» from it");
  h.expect((await tid("est-tpl-archive").count()) === 0 && (await tid("est-tpl-rename").count()) === 0, "a tech: no rename, no archive");
  await role("director");
};
