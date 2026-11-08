/**
 * e2e 199 — E3c and the debts of E3b (docs/specs/07 §12; S5t «Шаблон → смета», S0b). Every view.
 * - a module's template shows the module's NAME («Из модуля Водостоки (Gutters)»), never its key «gutters»;
 * - a module switched on with no starter estimates of its own: no «Шаблоны модулей» section (the core has none, В6);
 *   the section itself with a module's starters — unit:estimateStarters (no stand-in module in the app, §12 №13);
 * - «Копировать»: a new template «… (копия)», the company's own (no module's mark), the original untouched; «Отменить»
 *   takes it away (not to the archive);
 * - «Изменить строки»: the builder in the template's mode (no client, «Сохранить шаблон»): a line removed and the name
 *   changed → the SAME template, the kept line keeps its id (its cost stays its own), no estimate is made;
 * - a tech: no «Копировать», no «Изменить строки».
 * Test prices («тестовые», rule 9). By testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";
const T_MOD = "tpl-e2e-199-mod";
const T_OWN = "tpl-e2e-199-own";

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
  const estimatesBefore = await p.evaluate(({ k, mod, own }) => {
    const s = JSON.parse(localStorage.getItem(k));
    const settings = { discount: null, tax: { enabled: false, rateBps: 0, groups: { service: false, labor: false, material: false } }, deposit: { kind: "none" } };
    const line = (id, name, x) => ({ id, name, group: "service", quantity: "1", unit: "ea", unitPriceCents: 10000, ...x });
    s.db.estimateTemplates = [
      { id: mod, name: "Module starter (test)", module: "gutters", uses: 0, doc: { options: [{ id: "o-m", name: "Option", lines: [line("lm1", "Clean (test)")] }], settings } },
      {
        id: own, name: "Service visit (test)", uses: 2, costs: { "lo1": 4000, "lo2": 1500 },
        doc: { options: [{ id: "o-o", name: "Option", lines: [line("lo1", "Service call (test)"), line("lo2", "Haul away (test)", { group: "labor", unitPriceCents: 5000 })] }], settings },
      },
    ];
    s.db.checklistTemplates = [...(s.db.checklistTemplates || []), {
      id: "chk-e2e-199", name: "Module checklist (test)", module: "gutters",
      items: [{ id: "0e199000-0000-4000-8000-000000000001", label: "Check (test)", kind: "check", required: true }],
      appliesTo: { everyVisit: false, visitKinds: ["work"], catalogItemIds: [] },
    }];
    localStorage.setItem(k, JSON.stringify(s));
    return s.db.estimates.length;
  }, { k: DB_KEY, mod: T_MOD, own: T_OWN });

  // the module's name, not its key
  await h.go("/estimate/templates");
  await tid(`est-tpl-${T_MOD}`).waitFor({ timeout: 8000 });
  const card = await tid(`est-tpl-${T_MOD}`).innerText();
  h.expect(/Водостоки \(Gutters\)/.test(card) && !/модуля gutters/.test(card), `the module's name on the card: ${card}`);
  h.expect((await tid("est-starters").count()) === 0, "module off: no «Шаблоны модулей»");
  // the same on a checklist template of the module
  await h.go("/company/checklists");
  await tid("chk-tpl-chk-e2e-199").waitFor({ timeout: 8000 });
  const chk = await tid("chk-tpl-chk-e2e-199").innerText();
  h.expect(/Водостоки \(Gutters\)/.test(chk) && !/Модуль: gutters/.test(chk), `the module's name on the checklist card: ${chk}`);

  // switched on, but the module has no starter estimates yet: still no section
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => !!(await h.db()).company?.modules?.gutters?.enabled, "Gutters on");
  await h.go("/estimate/templates");
  await tid(`est-tpl-${T_OWN}`).waitFor({ timeout: 8000 });
  h.expect((await tid("est-starters").count()) === 0, "a module without starter estimates: no section");
  await h.shot("list");

  // «Копировать»
  await tid(`est-tpl-${T_OWN}`).click();
  await tid("est-tpl-sheet").waitFor({ timeout: 8000 });
  await h.shot("sheet");
  await tid("est-tpl-copy").getByRole("button").click();
  await waitFor(async () => (await tpls()).length === 3, "the copy is saved");
  const copy = (await tpls()).find((x) => x.id !== T_MOD && x.id !== T_OWN);
  h.expect(copy.name === "Service visit (test) (копия)", `the copy's name: ${copy.name}`);
  h.expect(!copy.module && !copy.uses, "the copy is the company's own: no module's mark, no uses");
  const cl = copy.doc.options[0].lines;
  h.expect(cl.length === 2 && !cl.some((l) => l.id === "lo1" || l.id === "lo2"), "the copy's own line ids");
  h.expect(copy.costs && Object.keys(copy.costs).length === 2 && Object.keys(copy.costs).every((k) => cl.some((l) => l.id === k)), "the costs follow the copy's lines");
  await tid(`est-tpl-${copy.id}`).waitFor({ timeout: 8000 });
  h.expect((await tpls()).find((x) => x.id === T_OWN).doc.options[0].lines.length === 2, "the original untouched");
  // «Отменить» the copy: gone (removed on the server once sent — deleted_at, §12.7), not archived
  await p.getByRole("button", { name: /Отменить|Undo|Deshacer/ }).first().click();
  await waitFor(async () => !(await tpls()).some((x) => x.id === copy.id), "«Отменить» takes the copy away");
  h.expect((await tpls()).length === 2, "no copy left, not even archived");

  // «Изменить строки»: the builder in the template's mode
  await tid(`est-tpl-${T_OWN}`).click();
  await tid("est-tpl-edit").getByRole("button").click();
  await p.waitForURL(new RegExp(`estimate/new\\?editTemplate=${T_OWN}`), { timeout: 8000 });
  await tid("est-tpl-editing").waitFor({ timeout: 8000 });
  h.expect(/Шаблоны смет/.test(await h.text()), "the crumb leads back to «Шаблоны смет», not «Новая смета»");
  h.expect((await tid("ue-save").count()) === 0 && (await tid("est-start").count()) === 0, "no client, no «Сохранить», no «С чего начать?»");
  await h.shot("edit");
  await tid("ue-line-lo2").getByRole("button").first().click();
  await tid("ue-line-remove").getByRole("button").click();
  await tid("ue-title").locator("input").fill("Service visit v2 (test)");
  await tid("est-tpl-save").getByRole("button").click();
  await p.waitForURL(/estimate\/templates/, { timeout: 8000 });
  await waitFor(async () => (await tpls()).find((x) => x.id === T_OWN)?.name === "Service visit v2 (test)", "the same template, renamed");
  const own = (await tpls()).find((x) => x.id === T_OWN);
  h.expect(own.doc.options[0].lines.length === 1 && own.doc.options[0].lines[0].id === "lo1", "a line removed, the kept line keeps its id");
  h.expect(own.costs && own.costs.lo1 === 4000, "the kept line keeps its cost");
  h.expect(own.uses === 2, "editing is no use");
  h.expect((await h.db()).estimates.length === estimatesBefore, "no estimate made");
  // «Отменить»: the template as it was (a change of its own — the edit may have been sent already)
  await p.getByRole("button", { name: /Отменить|Undo|Deshacer/ }).first().click();
  await waitFor(async () => {
    const x = (await tpls()).find((y) => y.id === T_OWN);
    return x?.name === "Service visit (test)" && x.doc.options[0].lines.length === 2;
  }, "«Отменить» brings the template's lines and name back");

  // a tech uses, but neither copies nor edits
  await role("tech");
  await h.go("/estimate/templates");
  await tid(`est-tpl-${T_OWN}`).click();
  await tid("est-tpl-sheet").waitFor({ timeout: 8000 });
  h.expect((await tid("est-tpl-use").count()) === 1, "a tech: «Новая смета»");
  h.expect((await tid("est-tpl-copy").count()) === 0 && (await tid("est-tpl-edit").count()) === 0, "a tech: no copy, no edit");
  // and the builder's template mode is not his: a plain new estimate («С чего начать?» — there are templates)
  await h.go(`/estimate/new?editTemplate=${T_OWN}`);
  await tid("est-start").waitFor({ timeout: 8000 });
  h.expect((await tid("est-tpl-editing").count()) === 0, "a tech: no template mode");
  await role("director");
};
