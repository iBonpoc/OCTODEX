/**
 * Wave 7а-2b — «Удалить аккаунт» (story map S22; docs/specs/19 §6.10–§6.12; Apple 5.1.1(v)). Demo mode: there is no
 * account, so the screen explains it and never deletes. The cloud side is db T50, deleteAccountFn.test.ts (the edge
 * function), unit deleteAccount.test.ts (words, the repeat, the last owner, the device wipe) and the manual pass §6.8.
 * - «Мои настройки»: the very last row «Удалить аккаунт» → /settings/delete-account;
 * - the screen: «Что удалится» and «Что останется у компании» (the business records, the history, the signed documents,
 *   the consent without the IP); the demo note;
 * - «Удалить навсегда» is off: no code, no account; the word of another language does not count;
 * - «Получить код»: with the network — «В демо аккаунта нет»; without — «Нужна сеть» (never queued);
 * - a change made offline: «Сначала дождитесь отправки» does not show in the demo (only the cloud's unsent block it).
 */
exports.run = async (h) => {
  const p = h.page;
  const btn = (name) => p.getByRole("button", { name, exact: true }).locator("visible=true").last();
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));

  // «Мои настройки»: the row is the last one
  await h.go("/settings");
  const row = p.getByTestId("settings-delete-account").locator("visible=true").last();
  await row.waitFor({ timeout: 4000 });
  await row.scrollIntoViewIfNeeded();
  // after «О приложении» and after the demo's «Для проверки» card: the very bottom
  const order = await p.evaluate(() => {
    const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).pop();
    const row = vis('[data-testid="settings-delete-account"]');
    const about = vis('[data-testid="settings-about"]');
    const reset = [...document.querySelectorAll("button, [role=button]")].filter((e) => e.offsetParent !== null && /Сбросить тестовые данные/.test(e.textContent || "")).pop();
    const after = (x) => !!x && !!(x.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { about: after(about), reset: after(reset) };
  });
  h.expect(order.about && order.reset, `«Удалить аккаунт» is the last row of «Мои настройки» (${JSON.stringify(order)})`);
  await h.expectText(/Удалить аккаунт/, "the row");
  await row.getByText("Удалить аккаунт").click();
  await p.waitForTimeout(600);
  h.expect(new URL(p.url()).pathname === "/settings/delete-account", `opens the screen (${p.url()})`);

  // what goes, what stays, the demo note
  await h.expectText(/Что удалится/, "what is deleted");
  for (const s of ["Ваше имя, email и телефон", "Вход в приложение", "Личные настройки", "Местоположение", "Личные заметки"]) await h.expectText(new RegExp(s), `goes: ${s}`);
  await h.expectText(/Что останется у компании/, "what stays");
  for (const s of ["Работы, сметы, счета, оплаты", "Удалённый пользователь", "История изменений", "подписанных документах", "без IP-адреса"]) await h.expectText(new RegExp(s), `stays: ${s}`);
  await h.expectText(/В демо аккаунта нет — удалять нечего/, "the demo explains");
  await h.shot("screen");

  // the word: «УДАЛИТЬ» in Russian; the button stays off in the demo (no account, no code) whatever is typed
  await h.expectText(/Введите слово УДАЛИТЬ/, "the word of the app's language");
  const del = btn("Удалить навсегда");
  h.expect(await del.isDisabled(), "«Удалить навсегда» is off without a code");
  const word = p.getByPlaceholder("УДАЛИТЬ").locator("visible=true").last();
  await word.fill("DELETE");
  h.expect(await del.isDisabled(), "another language's word: still off");
  await word.fill(" удалить ");
  h.expect(await del.isDisabled(), "the right word without a code and an account: still off");
  h.expect(await btn("Проверить код").isDisabled(), "«Проверить код» is off before a code is sent");

  // «Получить код»: the demo has no account; without the network — «Нужна сеть», nothing is queued
  await btn("Получить код").click();
  await h.expectText(/В демо аккаунта нет(?! —)/, "with the network: no account in the demo");
  await p.waitForTimeout(300);
  const q0 = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.queue.v1") || "[]").length);
  // «Проверка: режим без сети» lives in memory (a reload is online again): switch it, then go by the row, not by URL
  await h.go("/settings");
  await p.getByRole("switch", { name: /режим без сети/i }).locator("visible=true").last().click();
  await p.waitForTimeout(300);
  const row2 = p.getByTestId("settings-delete-account").locator("visible=true").last();
  await row2.scrollIntoViewIfNeeded();
  await row2.getByText("Удалить аккаунт").click();
  await p.waitForTimeout(600);
  await btn("Получить код").click();
  await h.expectText(/Нужна сеть/, "without the network: «Нужна сеть»");
  const q1 = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.queue.v1") || "[]").length);
  h.expect(q1 === q0, `nothing is queued (${q0} → ${q1})`);
  h.expect(!(await h.text()).includes("дождитесь отправки"), "the demo's queue does not block it");
};
