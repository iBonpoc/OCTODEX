/**
 * More = only places to go; Settings = account, theme, language, tips, "For testing" (docs/specs/05-menu-and-settings.md M1).
 * Same steps at every width (no layout-specific UI on these screens).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/more");
  const more = await h.text();
  h.expect(/Разделы/.test(more) && /Настройки компании/.test(more) && /Команда/.test(more), "More: sections + company");
  // no switches on More any more
  for (const s of ["Тема", "Роль", "Сбросить тестовые данные", "Проверка: режим без сети"]) h.expect(!more.includes(s), `More has no "${s}"`);
  h.expect((await p.getByRole("switch").count()) === 0, "no toggles on More");

  // the Settings row opens Settings
  await p.getByText("Настройки", { exact: true }).last().click();
  await p.waitForTimeout(700);
  h.expect(p.url().endsWith("/settings"), `settings opened: ${p.url()}`);
  await h.expectText(/Аккаунт[\s\S]*Вид и язык[\s\S]*Подсказки[\s\S]*Для проверки/, "settings groups in order");

  // theme switch works from Settings
  await p.getByRole("tab", { name: "Светлая", exact: true }).click(); await p.waitForTimeout(400);
  h.expect((await p.evaluate(() => localStorage.getItem("octo.theme.v1"))) === '"light"', "theme saved");
  await p.getByRole("tab", { name: "Тёмная", exact: true }).click(); await p.waitForTimeout(400);

  // role switch lives in "For testing" and moves to that role's home
  await p.getByRole("tab", { name: "Мастер", exact: true }).click(); await p.waitForTimeout(400);
  await p.waitForTimeout(500);
  h.expect(p.url().endsWith("/visits"), `tech home: ${p.url()}`);
  await h.go("/settings");
  await p.getByRole("tab", { name: "Директор", exact: true }).click(); await p.waitForTimeout(400);
  await p.waitForTimeout(500);
  h.expect(p.url().endsWith("/today"), `director home: ${p.url()}`);

  // back from Settings goes to More
  await h.go("/settings");
  await p.getByRole("button", { name: /Ещё/ }).first().click();
  await p.waitForTimeout(600);
  h.expect(p.url().endsWith("/more"), `settings → more: ${p.url()}`);

  // Company settings: same name in the menu and on the screen
  await h.clickText("Настройки компании");
  await p.waitForTimeout(600);
  h.expect(p.url().endsWith("/company"), `company opened: ${p.url()}`);
  await h.expectText(/Настройки компании/, "company screen title");
  await h.shot("settings");
};
