/**
 * S26 «кто» в задаче (docs/specs/23 §5; db T78–T79, migration 20261107060000): in the task sheet the office chooses
 * anyone on the team in «Кто»; the technician sees only himself — the server gives his task to nobody else.
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const plus = () => p.locator(wide ? '[data-testid="fab-header"]:visible' : '[data-testid="fab"]:visible');
  await h.go("/today");
  const d = await h.db();
  const me = d.members.find((m) => m.id === d.me);
  const others = d.members.filter((m) => m.id !== d.me && !m.pending);
  h.expect(me && others.length >= 2, "the demo has the signed-in person and others on the team");
  const chip = (sheet, name) => sheet.getByRole("radio", { name, exact: true }).or(sheet.getByRole("button", { name, exact: true }));
  const who = async (sheet) => {
    const out = [];
    for (const m of [me, ...others]) if (await chip(sheet, m.name).first().isVisible().catch(() => false)) out.push(m.id);
    return out;
  };

  // the office: everyone on the team
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("dispatcher")));
  await h.go("/tasks");
  await plus().click(); await p.waitForTimeout(500);
  let sheet = h.sheet();
  await sheet.getByText("Кто", { exact: true }).last().scrollIntoViewIfNeeded();
  const office = await who(sheet);
  h.expect(office.length === others.length + 1, `the office sees everyone in «Кто» (${office.join(", ")})`);
  await h.shot("office");
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);

  // the technician: only himself
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/tasks");
  await plus().click(); await p.waitForTimeout(500);
  sheet = h.sheet();
  await sheet.getByText("Кто", { exact: true }).last().scrollIntoViewIfNeeded();
  const tech = await who(sheet);
  h.expect(tech.length === 1 && tech[0] === me.id, `the technician sees only himself in «Кто» (${tech.join(", ")})`);
  await h.shot("tech");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
