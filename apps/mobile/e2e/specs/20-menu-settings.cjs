/**
 * «Ещё» = only places to go (docs/specs/13 v2 §2.3, variant Б); My settings = account, theme, language, tips, «Для проверки» in the demo.
 * /more is the «Ещё» screen of tiles at every width; on 820/1280 the same places are in the side menu.
 */
const { menuApi } = require("../menu.cjs");
exports.run = async (h) => {
  const p = h.page;
  const m = menuApi(h);
  const menu = m.menu;
  await h.go("/more");
  h.expect(new URL(p.url()).pathname === "/more", `/more is the «Ещё» screen (${p.url()})`);
  const tiles = () => p.locator('[data-testid="more-screen"]:visible');
  await tiles().waitFor({ timeout: 3000 });
  const more = await tiles().innerText();
  h.expect(/Работа/.test(more) && /Документы/.test(more) && /Настройки компании/.test(more) && /Команда/.test(more), "«Ещё»: groups + company");
  // no switches in «Ещё»
  for (const s of ["Тема", "Сбросить тестовые данные", "Проверка: режим без сети"]) h.expect(!more.includes(s), `«Ещё» has no "${s}"`);
  h.expect((await tiles().getByRole("switch").count()) === 0, "no toggles in «Ещё»");

  // «Мои настройки» opens Settings
  await tiles().getByRole("button", { name: "Мои настройки", exact: true }).click();
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

  // My settings is a section root (13а §3): no «back» (phone: «‹ Ещё»); Company settings: same name in the menu and on the screen
  await h.go("/settings");
  h.expect((await p.getByRole("button", { name: /^Назад/ }).count()) === 0, "no «back» on My settings");
  await m.open();
  await menu().getByRole("button", { name: "Настройки компании", exact: true }).click();
  await p.waitForTimeout(600);
  h.expect(p.url().endsWith("/company"), `company opened: ${p.url()}`);
  await h.expectText(/Настройки компании/, "company screen title");
  h.expect(await m.closedAfterChoice(), "☰ closed after a choice (the 1280 side menu stays)");
  await h.shot("settings");
};
