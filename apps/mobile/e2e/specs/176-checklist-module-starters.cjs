/**
 * e2e 176 — starter checklist templates of a module (docs/specs/08 §11.11; step 14 CH3b; S0b).
 * The module is off: «Чек-листы» offers nothing. The director switches Gutters on → «Шаблоны модулей» offers its three
 * starters → «Добавить» one: a company template with the module's mark and the module's item ids, the offer is gone.
 * «Отменить» brings the offer back. Archived — still not offered again. Found by testID and the db.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).last();
  const tpls = async () => (await h.db()).checklistTemplates || [];
  const until = async (ok) => {
    for (let i = 0; i < 20 && !ok(await tpls()); i++) await p.waitForTimeout(150);
    return tpls();
  };

  // off: nothing offered
  await h.go("/company/checklists");
  await tid("chk-tpl-tpl-job").waitFor();
  h.expect((await p.getByTestId("chk-starter-gutters-pre").count()) === 0, "module off: no starters");

  // on: the three starters
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  for (let i = 0; i < 20 && !(await h.db()).company?.modules?.gutters?.enabled; i++) await p.waitForTimeout(150);
  await h.go("/company/checklists");
  await tid("chk-starter-gutters-pre").waitFor();
  for (const k of ["handover", "clean"]) await tid(`chk-starter-gutters-${k}`).waitFor();
  await h.expectText(/Шаблоны модулей/, "the heading");
  await h.shot("starters");

  // «Добавить»: the company's template, the module's mark and item ids; the offer is gone
  await tid("chk-starter-gutters-pre").getByRole("button", { name: /Перед монтажом/ }).first().click();
  await h.expectText(/Шаблон добавлен/, "the toast");
  let list = await until((l) => l.some((x) => x.module === "gutters"));
  const t = list.find((x) => x.module === "gutters");
  h.expect(t && t.name === "Перед монтажом" && t.items.length === 4 && t.items[0].label === "Проверить лобовую доску на гниль", `the template: ${JSON.stringify(t)}`);
  h.expect(t.items.every((i) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(i.id)) && t.id !== "pre", "the module's item ids, a new template id");
  await tid(`chk-tpl-${t.id}`).waitFor();
  h.expect((await p.getByTestId("chk-starter-gutters-pre").count()) === 0, "added: not offered");

  // «Отменить»: the offer comes back
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  list = await until((l) => !l.some((x) => x.module === "gutters"));
  h.expect(!list.some((x) => x.module === "gutters"), "undone");
  await tid("chk-starter-gutters-pre").waitFor();

  // added again and archived: still not offered (the company's choice)
  await tid("chk-starter-gutters-pre").getByRole("button", { name: /Перед монтажом/ }).first().click();
  list = await until((l) => l.some((x) => x.module === "gutters"));
  const again = list.find((x) => x.module === "gutters");
  await h.go(`/company/checklist/${again.id}`);
  await tid("chk-tpl-archive").getByRole("button").click();
  await until((l) => l.find((x) => x.id === again.id)?.archivedAt);
  await h.go("/company/checklists");
  await tid("chk-starter-gutters-clean").waitFor();
  h.expect((await p.getByTestId("chk-starter-gutters-pre").count()) === 0, "archived: not offered again");
  await h.shot("after");
};
