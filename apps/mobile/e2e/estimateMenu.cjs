/**
 * The estimate card's «⋯» (#1412, DS Б4): «Изменить», «Как видит клиент», «Сохранить как шаблон», «PDF», «Отозвать ссылку» live in
 * the menu, not on the page. `estMore(p)` — the card is up (its «⋯» is there); `estAct(p, key)` opens «⋯» and presses the item
 * (`edit` | `client` | `template` | `pdf` | `revoke`); `estHas(p, key)` — the item is in the menu (it opens and closes «⋯»).
 * The main button «Отправить клиенту» stays on the page (`est-send`: the pinned bar on a phone, the top of the content from 820).
 */
const { pressEscUntilClosed } = require("./sheet.cjs");

const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();

async function estMore(p, timeout = 8000) {
  await vis(p, "est-more").waitFor({ timeout });
}

async function openMenu(p) {
  await estMore(p);
  await vis(p, "est-more").getByRole("button").click();
  await vis(p, "menu-items").waitFor({ timeout: 3000 });
}

async function estAct(p, key) {
  await openMenu(p);
  await vis(p, `est-act-${key}`).click();
  // the item runs once the menu is gone (menuPick)
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
}

async function estHas(p, key) {
  if ((await p.getByTestId("est-more").locator("visible=true").count()) === 0) return false;
  await openMenu(p);
  const has = (await p.getByTestId(`est-act-${key}`).locator("visible=true").count()) > 0;
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return has;
}

module.exports = { estMore, estAct, estHas };
