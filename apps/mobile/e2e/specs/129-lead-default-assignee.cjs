/**
 * e2e 129 — whom new leads go to (docs/14-leads-spec.md §6.4; companies.lead_default_assignee_id, вариант а). Every view.
 * - director: «Компания» has the «Лиды» card → /company/leads says «Владелец (по умолчанию)» (Alex Petrov);
 *   «Изменить» → the sheet lists the owner row and the employees at work, no subcontractor; picking Ivan saves at once;
 * - a new lead goes to Ivan; «Владелец» in the sheet clears the choice (null);
 * - Ivan chosen again, then switched off on «Команда» → a new lead goes to the owner, the page says «Владелец» again;
 * - the office (dispatcher): the page is read-only — the note, no «Изменить».
 * Waits on the stored data by condition (the phone's copy is written with a pause), finds rows by testID.
 */
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitDb = async (ok, what) => {
    let db = await h.db();
    for (let i = 0; i < 30 && !(db && ok(db)); i++) { await p.waitForTimeout(200); db = await h.db(); }
    h.expect(!!db && ok(db), what);
    return db;
  };
  const tag = `${h.layout.width}${h.layout.theme === "dark" ? "d" : "l"}`;
  let n = 0;
  const newLead = async () => {
    n += 1;
    const name = `Default ${tag} ${n}`;
    await h.go("/lead/new");
    await p.getByPlaceholder("(555) 555-0100").last().pressSequentially(`626129${String(h.layout.width * 10 + n + (h.layout.theme === "dark" ? 5 : 0)).slice(-4)}`);
    await p.getByPlaceholder("Имя", { exact: true }).last().fill(name);
    await p.getByPlaceholder("Улица, дом, офис").last().fill("129 Default St");
    await p.getByPlaceholder("Pasadena").last().fill("Glendale");
    await h.click("Сохранить лид");
    await p.waitForURL(/\/lead\/(?!new)[^/?]+/, { timeout: 5000 });
    const db = await waitDb((d) => d.leads.some((l) => l.name === name), `the lead is saved (${name})`);
    return db.leads.find((l) => l.name === name);
  };
  const pickInSheet = async (id) => {
    await tid("lead-default-change").getByRole("button").click();
    await tid(id).waitFor({ timeout: 3000 });
    await tid(id).getByRole("button").click();
  };

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/company");
  await tid("company-leads").waitFor({ timeout: 5000 });
  await tid("company-leads").getByRole("button").click();
  await p.waitForURL(/\/company\/leads$/, { timeout: 5000 });
  await tid("lead-default-current").waitFor({ timeout: 5000 });
  let cur = await tid("lead-default-current").innerText();
  h.expect(/Владелец \(по умолчанию\)/.test(cur) && /Alex Petrov/.test(cur), `nothing chosen: the owner (${cur})`);
  await h.shot("owner-default");

  // the sheet: the owner row, employees at work, no subcontractor
  await tid("lead-default-change").getByRole("button").click();
  await tid("lead-default-owner").waitFor({ timeout: 3000 });
  h.expect((await tid("lead-default-m-ivan").count()) === 1, "Ivan is on the list");
  h.expect((await tid("lead-default-m-sub").count()) === 0, "no subcontractor on the list");
  await h.shot("sheet");
  await tid("lead-default-m-ivan").getByRole("button").click();
  await waitDb((d) => d.company.leadDefaultAssigneeId === "m-ivan", "Ivan is saved as the default");
  await h.expectText(/Сохранено/, "the save toast");
  cur = await tid("lead-default-current").innerText();
  h.expect(/Ivan Sokolov/.test(cur), `the page shows Ivan (${cur})`);

  let lead = await newLead();
  h.expect(lead.assigneeId === "m-ivan", `a new lead goes to Ivan (${lead.assigneeId})`);

  // «Владелец» clears the choice
  await h.go("/company/leads");
  await pickInSheet("lead-default-owner");
  await waitDb((d) => d.company.leadDefaultAssigneeId === null, "«Владелец» clears the choice");
  lead = await newLead();
  h.expect(lead.assigneeId === "m-alex", `back to the owner (${lead.assigneeId})`);

  // Ivan again, then switched off → the owner
  await h.go("/company/leads");
  await pickInSheet("lead-default-m-ivan");
  await waitDb((d) => d.company.leadDefaultAssigneeId === "m-ivan", "Ivan chosen again");
  await h.go("/team");
  const card = p.locator('[data-testid="list-card"]:visible').filter({ hasText: "Ivan Sokolov" }).first();
  await card.click();
  await tid("member-sheet").waitFor({ timeout: 3000 });
  await tid("member-sheet").getByRole("button", { name: "Отключить" }).click();
  await tid("member-sheet").getByRole("button", { name: "Да, отключить" }).click();
  await waitDb((d) => d.members.some((m) => m.id === "m-ivan" && m.disabled), "Ivan is switched off");
  lead = await newLead();
  h.expect(lead.assigneeId === "m-alex", `Ivan switched off: the lead goes to the owner (${lead.assigneeId})`);
  await h.go("/company/leads");
  await tid("lead-default-current").waitFor({ timeout: 5000 });
  cur = await tid("lead-default-current").innerText();
  h.expect(/Владелец \(по умолчанию\)/.test(cur), `the page says the owner while Ivan is off (${cur})`);

  // the office sees it, changes nothing
  await setRole(h, "dispatcher");
  await h.go("/company/leads");
  await tid("lead-default-current").waitFor({ timeout: 5000 });
  await h.expectText(/Только просмотр — менять может директор/, "the read-only note for the office");
  h.expect((await tid("lead-default-change").count()) === 0, "no «Изменить» for the office");
  await h.shot("office");
};
