/**
 * e2e 506 — an expense's own screen (#2009): open from «Расходы», fix, remove.
 * С1: a card in «Расходы» opens the expense; its amount fixed $884.00 → $900.00 and its day moved to yesterday — saved,
 *     the list shows the new amount.
 * С2: «Удалить расход» → it leaves the list, the toast «Отменить» brings it back (rule 5).
 * С3: a technician opens another person's expense — read only, who entered it is said, no «Сохранить»; his own — editable.
 * An unknown expense — «Расход не найден». Every view (h.layout); the days come from the page's clock.
 */
const { dayKey, addDays } = require("../companyTime.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const amountIn = () => vis("field-amount").locator("input, textarea").first();
  // a card of «Расходы» by its vendor (the demo: x2 ABC Supply, x3 Chevron)
  const card = (vendor) => p.locator('[data-testid="list-card"]').locator("visible=true").filter({ hasText: vendor }).first();
  await h.seed("octo.role.v1", "director");
  await h.go("/money");
  const today = dayKey(await p.evaluate(() => Date.now()));
  const yesterday = addDays(today, -1);

  // С1: open from the list, fix the amount and the day
  await card("ABC Supply").click();
  await p.waitForURL((u) => u.pathname === "/expense/x2", { timeout: 8000 });
  await vis("expense-screen").waitFor({ timeout: 8000 });
  h.expect((await amountIn().inputValue()) === "884.00", `the expense's amount is in the field (${await amountIn().inputValue()})`);
  h.expect(/ABC Supply/.test(await vis("field-vendor").innerText()), "its vendor is chosen");
  await amountIn().fill("900");
  await vis("expense-date-button").click();
  await vis("expense-date-calendar").waitFor({ timeout: 5000 });
  const label = (k) => p.evaluate((x) => new Date(`${x}T12:00:00Z`).toLocaleDateString("ru-RU", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }), k);
  const yBtn = vis("expense-date-calendar").getByRole("button", { name: await label(yesterday), exact: true });
  if ((await yBtn.count()) === 0) await vis("expense-date-calendar").getByRole("button", { name: "Назад" }).first().click();
  await yBtn.click();
  await vis("expense-date-calendar").waitFor({ state: "detached", timeout: 5000 });
  await h.shot("expense-edit");
  await vis("expense-save").click();
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.expenses ?? []).some((y) => y.id === "x2" && y.amountCents === 90000), null, { timeout: 8000 });
  const x2 = ((await h.db()).expenses ?? []).find((y) => y.id === "x2");
  h.expect(x2.date === yesterday, `С1: its day is yesterday (${x2.date})`);
  await h.go("/money");
  await card("ABC Supply").waitFor({ timeout: 8000 });
  const card2 = await card("ABC Supply").innerText();
  h.expect(/\$900(\.00)?(?!\d)/.test(card2), `С1: the list shows the new amount (${card2})`);

  // С2: remove — gone from the list; «Отменить» brings it back
  await card("Chevron").click();
  await vis("expense-screen").waitFor({ timeout: 8000 });
  await vis("expense-remove").click();
  await p.waitForURL((u) => u.pathname === "/money", { timeout: 8000 });
  await p.locator('[data-testid="list-card"]').locator("visible=true").filter({ hasText: "Chevron" }).first().waitFor({ state: "detached", timeout: 8000 });
  // С2: the expense is removed (waits for the phone's saved copy, not a fixed time)
  await p.waitForFunction(() => !(JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.expenses ?? []).some((y) => y.id === "x3"), null, { timeout: 8000 });
  await p.getByRole("button", { name: "Отменить", exact: true }).locator("visible=true").last().click();
  await card("Chevron").waitFor({ timeout: 8000 });
  // С2: «Отменить» brings it back
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.expenses ?? []).some((y) => y.id === "x3"), null, { timeout: 8000 });

  // С3: a technician — another person's expense read only, his own editable
  await h.seed("octo.role.v1", "tech");
  await h.go("/expense/x1");
  await vis("expense-screen").waitFor({ timeout: 8000 });
  await vis("expense-readonly").waitFor({ timeout: 5000 });
  h.expect(/Иван|Ivan/.test(await vis("expense-readonly").innerText()), "С3: who entered it is said");
  h.expect((await p.getByTestId("expense-save").locator("visible=true").count()) === 0, "С3: no «Сохранить» on another person's expense");
  h.expect((await p.getByTestId("expense-remove").locator("visible=true").count()) === 0, "С3: no «Удалить» either");
  await h.shot("expense-readonly");
  await h.go("/expense/x2");
  await vis("expense-save").waitFor({ timeout: 8000 });

  // an unknown expense
  await h.go("/expense/nope");
  await vis("expense-not-found").waitFor({ timeout: 8000 });
};
