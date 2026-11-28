/**
 * The invoice card's actions (LAYOUT-RULES §3 «Объект», #2350): SMS, email, the link, PDF and «Напомнить» are icons in one row on the
 * page (`invoice-act-<key>`, `invoice-remind`); «⋯» holds only the director's «Аннулировать…». `invAct(p, key)` presses the icon
 * (`pdf` | `sms` | `email` | `copy`) or opens «⋯» and presses «Аннулировать…» (`void`); `invHas(p, key)` — the action is there.
 * «Принять оплату» stays the main button (`invoice-take-payment`).
 */
const { pressEscUntilClosed } = require("./sheet.cjs");

const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();
// «⋯» of the invoice: the Object template's header (v2, `invoice-screen-more`) or the old card's
const more = (p) => p.locator('[data-testid="invoice-screen-more"], [data-testid="invoice-more"]').locator("visible=true").first();
const itemId = (key) => (key === "void" ? "invoice-void-item" : `invoice-act-${key}`);

async function openMenu(p) {
  await more(p).waitFor({ timeout: 8000 });
  await more(p).getByRole("button").first().click();
  await vis(p, "menu-items").waitFor({ timeout: 3000 });
}

async function invAct(p, key) {
  // v2: the icon of the row under the header carries its testID on the button itself (IconRow)
  if (key !== "void") return vis(p, itemId(key)).click();
  await openMenu(p);
  await vis(p, itemId(key)).click();
  // the item runs once the menu is gone (menuPick)
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
  // v2: a red item asks first in the template's sheet (MoreButton → ConfirmSheet); a dimmed one (it says why not) does not
  const yes = p.getByTestId("tpl-confirm-yes").locator("visible=true");
  try {
    await yes.first().waitFor({ timeout: 800 });
  } catch {
    return;
  }
  await yes.first().click();
}

async function invHas(p, key) {
  if (key !== "void") return (await p.getByTestId(itemId(key)).locator("visible=true").count()) > 0;
  if ((await p.locator('[data-testid="invoice-screen-more"], [data-testid="invoice-more"]').locator("visible=true").count()) === 0) return false;
  await openMenu(p);
  const has = (await p.getByTestId(itemId(key)).locator("visible=true").count()) > 0;
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return has;
}

// «Напомнить»: the main or second step under the header when it is one of the invoice's steps (`invoice-remind-main`), else an
// item of «⋯» (`invoice-remind`, #3012: «Принять оплату» is the step, the reminder is in «⋯») — never both (InvoiceCard).
// `invRemind(p)` presses the one there; `invRemindCount(p)` — how many are shown on the page (the closed «⋯» is not counted).
const REMIND = '[data-testid="invoice-remind-main"], [data-testid="invoice-remind"]';
async function invRemind(p) {
  await p.locator('[data-testid="invoice-screen-more"], [data-testid="invoice-more"], [data-testid="invoice-remind-main"]').locator("visible=true").first().waitFor({ timeout: 8000 });
  const step = p.getByTestId("invoice-remind-main").locator("visible=true").first();
  if (await step.count()) return step.click();
  await openMenu(p);
  await vis(p, "invoice-remind").click();
}
const invRemindCount = (p) => p.locator(REMIND).count();

module.exports = { invAct, invHas, invRemind, invRemindCount };
