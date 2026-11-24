/**
 * Navigation to the money lists (wave 8 stitched into the shell; docs/specs/18-money-reports §1, 13 v2 §2.3, §4):
 * - «Ещё» → «Счета» opens the one invoices list /invoice on «Не оплачен · Просрочен»; «Оплаты» → /payments (group «Деньги»);
 * - «Главная» → «Должны» (was «Ждёт оплаты») opens the same list /invoice?f=owed (failed before: it opened /figures/awaiting);
 * - «Отчёты» → /reports and «Расходы» → /money in the same group;
 * - «Работа без сметы» in a client's header «＋» opens /job/new?customerId= and back goes to that client (S17, #1343);
 * - the office opens /payments too (the chain «Счета › Счёт» is a unit test: test/hierarchy.test.ts);
 * - sales: «Счета» yes, «Оплаты» no (the tile is missing and /payments is closed); the technician: neither.
 */
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;
const { menuApi } = require("../menu.cjs");

exports.run = async (h) => {
  const p = h.page;
  const m = menuApi(h);
  const item = (name) => m.menu().getByRole("button", { name, exact: true }).locator("visible=true");

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/today");

  // v2: the list opens with what is owed first — the overdue group, then the waiting one
  const owedFirst = async (what) => {
    await p.getByTestId("invoice-list-group-overdue").locator("visible=true").first().waitFor({ timeout: 5000 });
    const groups = await p.locator('[data-testid^="invoice-list-group-"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    h.expect(groups[0] === "invoice-list-group-overdue", `${what}: the overdue group first (${groups.join(", ")})`);
  };
  // Главная → the «Должны» tile (v2 «Требует действия») → the invoices list on what is owed
  await p.getByTestId("tile-owed").locator("visible=true").first().click();
  await p.waitForURL(/\/invoice/, { timeout: 5000 });
  h.expect(path(h) === "/invoice" && p.url().includes("f=owed"), `«Должны» → /invoice?f=owed (${p.url()})`);
  await owedFirst("the owed list");

  // «Ещё» → «Счета» and «Оплаты»
  await m.open();
  h.expect((await item("Оплаты").count()) === 1, "director: «Оплаты» in the menu");
  await item("Счета").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/invoice", `«Счета» → /invoice (${p.url()})`);
  await owedFirst("«Счета»");
  await h.shot("invoices-from-more");

  await m.open();
  await item("Оплаты").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/payments", `«Оплаты» → /payments (${p.url()})`);
  for (const [name, to] of [["Отчёты", "/reports"], ["Расходы", "/money"]]) {
    await m.open();
    await item(name).click();
    await p.waitForTimeout(700);
    h.expect(path(h) === to, `«${name}» → ${to} (${p.url()})`);
  }

  // «Работа без сметы» on a client (S17, #1343; v2 — the header «＋»): tied to it, back returns to it
  const db = await h.db();
  const cust = db.customers.find((c) => c.status === "active") ?? db.customers[0];
  await h.go(`/client/${cust.id}`);
  // v2: the client's header «＋» menu → «Работа без сметы» (client-create-job)
  await p.getByTestId("client-screen-create").locator("visible=true").first().click();
  await p.locator('[data-testid="menu-items"] [data-testid="client-create-job"]').locator("visible=true").first().click();
  await p.waitForURL(/\/job\/new/, { timeout: 5000 });
  h.expect(path(h) === "/job/new" && p.url().includes(`customerId=${cust.id}`), `«Новая работа» → /job/new?customerId= (${p.url()})`);
  await h.expectText(/Новая работа/, "the form is open");
  h.expect((await p.getByRole("button", { name: new RegExp(`^Назад: ${cust.name}`) }).locator("visible=true").count()) >= 1, "back goes to the client");

  // the office has Payments too
  await setRole(h, "dispatcher");
  await h.go("/payments");
  await p.waitForTimeout(500);
  h.expect(path(h) === "/payments", `dispatcher opens /payments (${p.url()})`);

  // sales: «Счета» yes, «Оплаты» no
  await setRole(h, "sales");
  await h.go("/leads");
  await m.open();
  h.expect((await item("Счета").count()) === 1, "sales: «Счета» in the menu");
  h.expect((await item("Оплаты").count()) === 0, "sales: no «Оплаты»");
  await m.close();
  await h.go("/payments");
  await p.waitForTimeout(600);
  h.expect(path(h) === "/leads", `sales /payments → home (${p.url()})`);

  // the technician: neither
  await setRole(h, "tech");
  await h.go("/visits");
  await m.open();
  for (const name of ["Счета", "Оплаты"]) h.expect((await item(name).count()) === 0, `tech: no «${name}»`);
  await m.close();
  await h.go("/payments");
  await p.waitForTimeout(600);
  h.expect(path(h) === "/visits", `tech /payments → /visits (${p.url()})`);

  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${h.layout.width}`);
};
