/**
 * The invoice card's «⋯» (#1474, DS Б4): PDF, «Напомнить», SMS, email and the director's «Аннулировать…» live in the menu, not on the
 * page. `invAct(p, key)` opens «⋯» and presses the item (`pdf` | `remind` | `sms` | `email` | `void`); `invHas(p, key)` — the item is
 * in the menu (it opens and closes «⋯»). The main button «Принять оплату» stays on the page (`invoice-take-payment`).
 */
const { pressEscUntilClosed } = require("./sheet.cjs");

const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();
const itemId = (key) => (key === "void" ? "invoice-void-item" : `invoice-act-${key}`);

async function openMenu(p) {
  await vis(p, "invoice-more").waitFor({ timeout: 8000 });
  await vis(p, "invoice-more").getByRole("button").click();
  await vis(p, "menu-items").waitFor({ timeout: 3000 });
}

async function invAct(p, key) {
  await openMenu(p);
  await vis(p, itemId(key)).click();
  // the item runs once the menu is gone (menuPick)
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
}

async function invHas(p, key) {
  if ((await p.getByTestId("invoice-more").locator("visible=true").count()) === 0) return false;
  await openMenu(p);
  const has = (await p.getByTestId(itemId(key)).locator("visible=true").count()) > 0;
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return has;
}

module.exports = { invAct, invHas };
