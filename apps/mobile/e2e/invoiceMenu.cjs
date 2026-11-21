/**
 * The invoice card's actions (LAYOUT-RULES §3 «Объект», #2350): SMS, email, the link, PDF and «Напомнить» are icons in one row on the
 * page (`invoice-act-<key>`, `invoice-remind`); «⋯» holds only the director's «Аннулировать…». `invAct(p, key)` presses the icon
 * (`pdf` | `sms` | `email` | `copy`) or opens «⋯» and presses «Аннулировать…» (`void`); `invHas(p, key)` — the action is there.
 * «Принять оплату» stays the main button (`invoice-take-payment`).
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
  if (key !== "void") return vis(p, itemId(key)).getByRole("button").click();
  await openMenu(p);
  await vis(p, itemId(key)).click();
  // the item runs once the menu is gone (menuPick)
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
}

async function invHas(p, key) {
  if (key !== "void") return (await p.getByTestId(itemId(key)).locator("visible=true").count()) > 0;
  if ((await p.getByTestId("invoice-more").locator("visible=true").count()) === 0) return false;
  await openMenu(p);
  const has = (await p.getByTestId(itemId(key)).locator("visible=true").count()) > 0;
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return has;
}

module.exports = { invAct, invHas };
