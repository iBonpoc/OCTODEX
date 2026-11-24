/**
 * S26 «кто» в задаче (docs/specs/23 §5; db T78–T79, migration 20261107060000): in the task sheet the office chooses
 * anyone on the team in «Кто»; the technician sees only himself — the server gives his task to nobody else.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const { listCreate } = require("../listScreen.cjs");
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  // v2: «＋» of the List template's header
  const plus = () => listCreate(p, "tasks", "tasks-create-new");
  await h.go("/today");
  const d = await h.db();
  const me = d.members.find((m) => m.id === d.me);
  const others = d.members.filter((m) => m.id !== d.me && !m.pending);
  h.expect(me && others.length >= 2, "the demo has the signed-in person and others on the team");
  const chip = (sheet, name) => sheet.getByRole("radio", { name, exact: true }).or(sheet.getByRole("button", { name, exact: true }));
  // «Кто ⌄» is a row with a menu (spec 56 wave 5а): open it, read its items, close it
  const who = async (sheet) => {
    await sheet.getByTestId("task-who-button").click();
    await p.getByRole("menu").waitFor({ timeout: 4000 });
    const out = [];
    for (const m of [me, ...others]) if ((await p.getByTestId(`task-who-${m.id}`).locator("visible=true").count()) > 0) out.push(m.id);
    // close the menu by choosing me (an Esc would be eaten by the sheet under it — CHECKS §9); «Кто» is the signed-in person anyway
    await p.getByTestId(`task-who-${me.id}`).locator("visible=true").first().click();
    await p.getByRole("menu").waitFor({ state: "detached", timeout: 4000 });
    return out;
  };

  // the office: everyone on the team
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("dispatcher")));
  await h.go("/tasks");
  await plus(); await p.waitForTimeout(500);
  let sheet = h.sheet();
  await sheet.getByText("Кто", { exact: true }).last().scrollIntoViewIfNeeded();
  const office = await who(sheet);
  h.expect(office.length === others.length + 1, `the office sees everyone in «Кто» (${office.join(", ")})`);
  await h.shot("office");
  await pressEscUntilClosed(p);

  // the technician: only himself
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/tasks");
  await plus(); await p.waitForTimeout(500);
  sheet = h.sheet();
  await sheet.getByText("Кто", { exact: true }).last().scrollIntoViewIfNeeded();
  const tech = await who(sheet);
  h.expect(tech.length === 1 && tech[0] === me.id, `the technician sees only himself in «Кто» (${tech.join(", ")})`);
  await h.shot("tech");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
