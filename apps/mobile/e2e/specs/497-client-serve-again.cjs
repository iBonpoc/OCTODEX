/**
 * e2e 497 — #2098 (founder 18.11): «не обслуживаем» is reversible.
 * С1 ДАНО клиент с пометкой «не обслуживаем», директор; КОГДА «Снова обслуживать» → подтверждение; ТОГДА клиент «Клиент»,
 *    снова «Создать смету», в подтверждении сказано, что старые ссылки не вернутся.
 * С2 ДАНО продажник; ТОГДА кнопки «Снова обслуживать» нет.
 * С3 ДАНО «Отменить» в тосте; ТОГДА пометка снова стоит, с той же причиной.
 * С4 ДАНО «Отмена» в подтверждении; ТОГДА пометка остаётся.
 * Every view; seeded from a page without the app (h.seed).
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.customers?.length, KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const c = raw.db.customers.find((x) => x.id === "c3");
  Object.assign(c, { status: "do_not_service", statusReason: "Did not pay 497" });
  await h.seed(KEY, raw);
  await h.seed("octo.role.v1", "director");
  const status = async () => (await h.db()).customers.find((x) => x.id === "c3");
  const make = () => p.locator('[data-testid="client-make-estimate"]:visible');
  const yes = () => p.getByTestId("client-serve-again-yes").locator("visible=true").first();

  // С4: «Отмена» keeps the mark
  await h.go("/client/c3");
  await p.getByTestId("client-serve-again").locator("visible=true").first().click();
  await yes().waitFor({ timeout: 8000 });
  await h.expectText(/Старые ссылки клиенту не вернутся/, "С1 the confirmation says old links do not come back");
  await h.expectText(/Причина: Did not pay 497/, "С1 the confirmation shows the reason");
  await h.shot("confirm");
  await p.getByTestId("client-serve-again-sheet").getByRole("button", { name: "Отмена", exact: true }).click();
  // the sheet is gone, the button is back — and the mark stays
  await p.getByTestId("client-serve-again-sheet").waitFor({ state: "hidden", timeout: 8000 });
  h.expect((await status()).status === "do_not_service", "С4 «Отмена»: the mark stays");

  // С1
  await p.getByTestId("client-serve-again").locator("visible=true").first().click();
  await yes().click();
  await p.waitForFunction((k) => JSON.parse(localStorage.getItem(k) || "null")?.db?.customers?.find((x) => x.id === "c3")?.status === "active", KEY, { timeout: 8000 });
  await make().first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("client-serve-again").locator("visible=true").count()) === 0, "С1 served again: «Создать смету» is back, no button");

  // С3: «Отменить» marks the client again, the same reason
  await p.getByTestId("toast-undo").locator("visible=true").first().click();
  await p.waitForFunction((k) => JSON.parse(localStorage.getItem(k) || "null")?.db?.customers?.find((x) => x.id === "c3")?.status === "do_not_service", KEY, { timeout: 8000 });
  h.expect((await status()).statusReason === "Did not pay 497", `С3 «Отменить»: the mark again, the same reason (${(await status()).statusReason})`);

  // С2: sales have no button
  await h.seed("octo.role.v1", "sales");
  await h.go("/client/c3");
  await h.expectText(/Не обслуживаем/, "С2 sales see the mark");
  h.expect((await p.getByTestId("client-serve-again").locator("visible=true").count()) === 0, "С2 sales: no «Снова обслуживать»");
};
