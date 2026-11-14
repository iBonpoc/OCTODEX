/**
 * The receipt's «⋯» (#1474, DS Б4): PDF, SMS, email and «Вернуть деньги…» (last, red; it opens the refund sheet, which asks and
 * confirms as before) live in the menu, not on the page. `rcptAct(p, key)` opens «⋯» and presses the item (`pdf` | `sms` | `email` |
 * `refund`); `rcptHas(p, key)` — the item is in the menu. The next step («Зачесть в счёт» / «Отправить квитанцию») stays on the page.
 */
const { pressEscUntilClosed } = require("./sheet.cjs");

const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();
const itemId = (key) => (key === "refund" ? "rcpt-refund" : `rcpt-act-${key}`);

async function openMenu(p) {
  await vis(p, "rcpt-more").waitFor({ timeout: 8000 });
  await vis(p, "rcpt-more").getByRole("button").click();
  await vis(p, "menu-items").waitFor({ timeout: 3000 });
}

async function rcptAct(p, key) {
  await openMenu(p);
  await vis(p, itemId(key)).click();
  // the item runs once the menu is gone (menuPick)
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
}

async function rcptHas(p, key) {
  await openMenu(p);
  const has = (await p.getByTestId(itemId(key)).locator("visible=true").count()) > 0;
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return has;
}

module.exports = { rcptAct, rcptHas };
