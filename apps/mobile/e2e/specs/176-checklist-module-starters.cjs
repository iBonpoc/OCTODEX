/**
 * e2e 176 — starter checklist templates of a module (docs/specs/08 §11.11; step 14 CH3b; S0b).
 * The module is off: «Чек-листы» offers nothing. The director switches Gutters on → «Шаблоны модулей» offers its three
 * starters → «Добавить» one: a company template with the module's mark and the module's item ids, the offer is gone.
 * Added, it applies to «работа» visits (#607). «Отменить» brings the offer back. Archived — still not offered again. Found by testID and the db.
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
  await tid("chk-starter-gutters-pre").getByRole("button", { name: "Добавить" }).first().click();
  await h.expectText(/Шаблон добавлен/, "the toast");
  let list = await until((l) => l.some((x) => x.module === "gutters"));
  const t = list.find((x) => x.module === "gutters");
  h.expect(t && t.name === "Перед монтажом" && t.items.length === 4 && t.items[0].label === "Проверить лобовую доску на гниль", `the template: ${JSON.stringify(t)}`);
  h.expect(t.items.every((i) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(i.id)) && /^[0-9a-f-]{36}$/.test(t.id), "the module's item ids, the company's template id");
  await tid(`chk-tpl-${t.id}`).waitFor();
  // #607: it comes into every «работа» visit by itself, into no inspection
  h.expect(JSON.stringify(t.appliesTo) === JSON.stringify({ everyVisit: false, visitKinds: ["work"], catalogItemIds: [] }), `applies to «работа» visits: ${JSON.stringify(t.appliesTo)}`);
  h.expect(/Работа/.test(await tid(`chk-tpl-${t.id}`).innerText()), "the list says it: «Работа»");
  h.expect((await p.getByTestId("chk-starter-gutters-pre").count()) === 0, "added: not offered");

  // «Отменить»: the offer comes back
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  list = await until((l) => !l.some((x) => x.module === "gutters"));
  h.expect(!list.some((x) => x.module === "gutters"), "undone");
  await tid("chk-starter-gutters-pre").waitFor();

  // added again and archived: still not offered (the company's choice)
  await tid("chk-starter-gutters-pre").getByRole("button", { name: "Добавить" }).first().click();
  list = await until((l) => l.some((x) => x.module === "gutters"));
  const again = list.find((x) => x.module === "gutters");
  h.expect(again.id === t.id, "the same starter is the same row (fixed id: two phones make one)");
  await h.go(`/company/checklist/${again.id}`);
  await tid("chk-tpl-archive").getByRole("button").click();
  await until((l) => l.find((x) => x.id === again.id)?.archivedAt);
  await h.go("/company/checklists");
  await tid("chk-starter-gutters-clean").waitFor();
  h.expect((await p.getByTestId("chk-starter-gutters-pre").count()) === 0, "archived: not offered again");
  await h.shot("after");

  // #607: «Сдача работы» added (the archived «Перед монтажом» takes nothing) and «Чистка» added — a work visit made by the office
  // takes the first, never the cleaning; an inspection takes neither
  for (const k of ["handover", "clean"]) await tid(`chk-starter-gutters-${k}`).getByRole("button", { name: "Добавить" }).first().click();
  list = await until((l) => l.filter((x) => x.module === "gutters").length === 3);
  const handover = list.find((x) => x.module === "gutters" && x.name === "Сдача работы");
  const clean = list.find((x) => x.module === "gutters" && x.name === "Чистка");
  h.expect(handover && clean && JSON.stringify(handover.appliesTo.visitKinds) === '["work"]' && clean.appliesTo.visitKinds.length === 0, "«Сдача работы»: «работа»; «Чистка»: no kind");

  await h.go("/p/demo0handyman0estimate0000000001");
  await h.sign("Linda Alvarez");
  await h.go("/estimate/e6");
  const pad = p.getByLabel(/расписывается|signs here/i).last();
  await pad.scrollIntoViewIfNeeded();
  const bb = await pad.boundingBox();
  await p.mouse.move(bb.x + 30, bb.y + 90);
  await p.mouse.down();
  for (let i = 0; i < 20; i++) await p.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
  await p.mouse.up();
  await p.getByRole("button", { name: "Подписать договор" }).last().click();
  await p.waitForFunction((k) => (JSON.parse(localStorage.getItem(k)).db.jobs || []).some((j) => j.estimateId === "e6"), "octo.db.v5", { timeout: 8000 });
  const job = (await h.db()).jobs.find((j) => j.estimateId === "e6");
  await h.go(`/job/schedule?jobId=${job.id}`);
  await p.getByRole("radiogroup").first().getByRole("radio").nth(require("../companyTime.cjs").workdayOffset(3)).click();
  await p.getByRole("button", { name: "Ivan Sokolov" }).last().click();
  await p.getByRole("radio", { name: /^1:00/ }).last().click();
  await p.getByRole("button", { name: "Запланировать", exact: true }).last().click();
  await p.getByRole("button", { name: "Не сейчас" }).last().waitFor({ timeout: 8000 });
  await p.getByRole("button", { name: "Не сейчас" }).last().click();
  await p.waitForFunction(([k, id]) => (JSON.parse(localStorage.getItem(k)).db.visits || []).some((v) => v.jobId === id), ["octo.db.v5", job.id], { timeout: 8000 });
  const wv = (await h.db()).visits.find((x) => x.jobId === job.id);
  const items = wv.checklist || [];
  h.expect(items.some((i) => i.templateId === handover.id), "the work visit takes the items of «Сдача работы», each with its templateId");
  h.expect(items.every((i) => !i.templateId || i.templateId !== clean.id), "never the cleaning's items (a cleaning is not part of every job)");
  h.expect(!items.some((i) => i.templateId === t.id), "the archived «Перед монтажом» takes nothing");
  await h.shot("work-visit");

  // an inspection (a lead, no job) takes none of the module's
  await h.go("/inbox");
  const angela = (await h.db()).leads.find((x) => x.name === "Angela Rossi");
  await h.go(`/lead/${angela.id}`);
  await h.clickText("Задачи");
  await h.click("Что дальше?");
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).click();
  await h.sheet().getByRole("button", { name: "Ivan Sokolov" }).click();
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click();
  await p.waitForFunction(([k, id]) => (JSON.parse(localStorage.getItem(k)).db.visits || []).some((v) => v.leadId === id), ["octo.db.v5", angela.id], { timeout: 8000 });
  const iv = (await h.db()).visits.find((x) => x.leadId === angela.id);
  h.expect(iv && !(iv.checklist || []).some((i) => i.templateId === handover.id || i.templateId === clean.id), "the inspection takes none of the module's templates");
};
