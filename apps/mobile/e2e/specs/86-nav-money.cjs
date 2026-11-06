/**
 * Navigation to the money lists (wave 8 stitched into the shell; docs/specs/18-money-reports §1, 13 v2 §2.3, §4):
 * - «Ещё» → «Счета» opens the one invoices list /invoice on «Не оплачен · Просрочен»; «Оплаты» → /payments (group «Деньги»);
 * - «Главная» → «Ждёт оплаты» opens the same list /invoice?f=owed (failed before: it opened /figures/awaiting);
 * - «Отчёты» → /reports and «Расходы» → /money in the same group;
 * - «＋» → «Новая работа» on a client opens /job/new?customerId= and back goes to that client (S17);
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

  // Главная → «Ждёт оплаты» → the invoices list on its owed chip
  await p.getByText("Ждёт оплаты", { exact: true }).locator("visible=true").first().click();
  await p.waitForTimeout(800);
  h.expect(path(h) === "/invoice" && p.url().includes("f=owed"), `«Ждёт оплаты» → /invoice?f=owed (${p.url()})`);
  await h.expectText(/Не оплачен · Просрочен · \d+/, "the owed chip is on");

  // «Ещё» → «Счета» and «Оплаты»
  await m.open();
  h.expect((await item("Оплаты").count()) === 1, "director: «Оплаты» in the menu");
  await item("Счета").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/invoice", `«Счета» → /invoice (${p.url()})`);
  await h.expectText(/Не оплачен · Просрочен · \d+/, "the list opens on «Не оплачен · Просрочен»");
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

  // «＋» → «Новая работа» on a client: tied to that client, back returns to it
  const db = await h.db();
  const cust = db.customers.find((c) => c.status === "active") ?? db.customers[0];
  await h.go(`/client/${cust.id}`);
  await p.getByTestId(h.layout.width >= 820 ? "fab-header" : "fab").locator("visible=true").click();
  const job = p.locator('[aria-modal="true"]').last().getByTestId("fab-job");
  await job.waitFor({ timeout: 3000 });
  await job.click();
  await p.waitForTimeout(800);
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
