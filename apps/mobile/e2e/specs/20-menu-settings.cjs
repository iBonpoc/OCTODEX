/**
 * ☰ = only places to go (docs/specs/13 §2.3); My settings = account, theme, language, tips, «Для проверки» in the demo.
 * The old «Ещё» address (/more) opens the role's home with ☰ open. Same steps at every width.
 */
/** the visible ☰ (the tab navigator keeps visited tabs mounted, hidden, with their own ☰) */
const menuButton = async (p) => {
  const all = p.getByRole("button", { name: "Меню", exact: true });
  // a screen opened by a tab may still be rendering: wait up to 3 s
  for (let t = 0; t < 15; t++, await p.waitForTimeout(200))
    for (let i = (await all.count()) - 1; i >= 0; i--) if (await all.nth(i).isVisible()) return all.nth(i);
  throw new Error("no visible ☰");
};
exports.run = async (h) => {
  const p = h.page;
  const menu = () => p.getByRole("dialog", { name: "Меню" });
  await h.go("/more");
  h.expect(new URL(p.url()).pathname === "/today", `/more → the director's home (${p.url()})`);
  await menu().waitFor({ timeout: 3000 });
  const more = await menu().innerText();
  h.expect(/Работа/.test(more) && /Документы/.test(more) && /Настройки компании/.test(more) && /Команда/.test(more), "☰: groups + company");
  // no switches in the menu
  for (const s of ["Тема", "Сбросить тестовые данные", "Проверка: режим без сети"]) h.expect(!more.includes(s), `☰ has no "${s}"`);
  h.expect((await menu().getByRole("switch").count()) === 0, "no toggles in ☰");

  // «Мои настройки» opens Settings
  await menu().getByRole("button", { name: "Мои настройки", exact: true }).click();
  await p.waitForTimeout(700);
  h.expect(p.url().endsWith("/settings"), `settings opened: ${p.url()}`);
  await h.expectText(/Аккаунт[\s\S]*Вид и язык[\s\S]*Подсказки[\s\S]*Для проверки/, "settings groups in order");

  // theme switch works from Settings
  await p.getByRole("tab", { name: "Светлая", exact: true }).click(); await p.waitForTimeout(400);
  h.expect((await p.evaluate(() => localStorage.getItem("octo.theme.v1"))) === '"light"', "theme saved");
  await p.getByRole("tab", { name: "Тёмная", exact: true }).click(); await p.waitForTimeout(400);

  // the role switch (several roles) moves to that role's home
  await p.getByRole("tab", { name: "Мастер", exact: true }).click(); await p.waitForTimeout(400);
  await p.waitForTimeout(500);
  h.expect(p.url().endsWith("/visits"), `tech home: ${p.url()}`);
  await h.go("/settings");
  await p.getByRole("tab", { name: "Директор", exact: true }).click(); await p.waitForTimeout(400);
  await p.waitForTimeout(500);
  h.expect(p.url().endsWith("/today"), `director home: ${p.url()}`);

  // My settings is a ☰ root (13а §3): ☰ instead of «back»; Company settings: same name in the menu and on the screen
  await h.go("/settings");
  h.expect((await p.getByRole("button", { name: /^Назад/ }).count()) === 0, "no «back» on My settings");
  await (await menuButton(p)).click();
  await menu().waitFor({ timeout: 3000 });
  await menu().getByRole("button", { name: "Настройки компании", exact: true }).click();
  await p.waitForTimeout(600);
  h.expect(p.url().endsWith("/company"), `company opened: ${p.url()}`);
  await h.expectText(/Настройки компании/, "company screen title");
  h.expect((await menu().count()) === 0, "☰ closed after a choice");
  await h.shot("settings");
};
