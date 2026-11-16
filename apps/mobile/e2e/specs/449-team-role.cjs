/**
 * e2e 449 — the role of a person already on the team (#1866; founder 16.11: «как в компанию пригласить сотрудника и
 * определять для него роли»). Demo, the owner (director): «Команда» → a tech → «Роль» → «Диспетчер» → asked first →
 * the card says «Диспетчер», the toast; «Отменить» brings «Мастер» back. No «Роль» on my own card, on a subcontractor's
 * (a new invitation) or for the office. The server side is db T301.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const cards = () => p.locator('[data-testid="list-card"]:visible');
  const cardOf = (name) => cards().filter({ hasText: name }).first();
  const sheet = (id) => p.getByTestId(id).locator("visible=true");
  const rolesOf = async (id) => JSON.stringify((await h.db()).members.find((m) => m.id === id).roles);
  await h.go("/today");
  await setRole(h, "director");
  await h.go("/team");

  let db = await h.db();
  const tech = db.members.find((m) => m.id !== db.me && !m.pending && m.kind === "employee" && JSON.stringify(m.roles) === '["tech"]');
  h.expect(!!tech, "a tech on the team");

  // a tech → «Диспетчер»: the row, the roles as rows, asked first
  await cardOf(tech.name).click();
  await sheet("member-sheet").waitFor({ timeout: 3000 });
  const row = sheet("member-role");
  await row.waitFor({ timeout: 3000 });
  h.expect((await row.innerText()).includes("Мастер"), `the role now: ${(await row.innerText()).slice(0, 60)}`);
  await row.getByRole("button").first().click();
  await sheet("member-role-office").waitFor({ timeout: 3000 });
  for (const r of ["tech", "sales", "office", "admin"]) h.expect((await sheet(`member-role-${r}`).count()) === 1, `the choice ${r}`);
  await h.shot("role-choices");
  await sheet("member-role-office").getByRole("button").first().click();
  await sheet("member-role-confirm").waitFor({ timeout: 3000 });
  h.expect((await sheet("member-role-confirm").innerText()).includes("Диспетчер"), "asked first, with the new role");
  h.expect((await rolesOf(tech.id)) === '["tech"]', "nothing changed before «Изменить роль»");
  await h.shot("role-confirm");
  await sheet("member-role-yes").click();
  await p.getByTestId("toast-undo").locator("visible=true").first().waitFor({ timeout: 5000 });
  await h.expectText(new RegExp(`${tech.name}: теперь «Диспетчер»`), "the toast");
  h.expect((await rolesOf(tech.id)) === '["dispatcher"]', "the role is the office's now");
  h.expect((await cardOf(tech.name).innerText()).includes("Диспетчер"), "the card says «Диспетчер»");
  await h.shot("role-changed");
  // «Отменить» brings the role before back (rule 5)
  await p.getByTestId("toast-undo").locator("visible=true").first().click();
  await cardOf(tech.name).getByText("Мастер").first().waitFor({ timeout: 5000 });
  h.expect((await rolesOf(tech.id)) === '["tech"]', "«Отменить»: a tech again");

  // my own card: no «Роль»
  db = await h.db();
  const me = db.members.find((m) => m.id === db.me);
  await cardOf(me.name).click();
  await sheet("member-sheet").waitFor({ timeout: 3000 });
  h.expect((await sheet("member-role").count()) === 0, "no «Роль» on my own card");
  await pressEscUntilClosed(p);
  // a subcontractor: no «Роль», says how (a new invitation)
  const sub = db.members.find((m) => m.kind === "sub" && !m.pending);
  if (sub) {
    await cardOf(sub.name).click();
    await sheet("member-sheet").waitFor({ timeout: 3000 });
    h.expect((await sheet("member-role").count()) === 0, "no «Роль» for a subcontractor");
    await h.expectText(/только по новому приглашению/, "a subcontractor: a new invitation");
    await pressEscUntilClosed(p);
  }
  // the office: nobody's role
  await setRole(h, "dispatcher");
  await h.go("/team");
  await cards().first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("member-role").count()) === 0, "the office changes no roles");

  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${h.layout.width}`);
};
