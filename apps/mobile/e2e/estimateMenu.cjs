/**
 * The estimate card's «⋯» (#1412, DS Б4): «Изменить», «Как видит клиент», «Сохранить как шаблон», «PDF», «Отозвать ссылку» live in
 * the menu, not on the page. `estMore(p)` — the card is up (its «⋯» is there); `estAct(p, key)` opens «⋯» and presses the item
 * (`edit` | `client` | `template` | `pdf` | `revoke`); `estHas(p, key)` — the item is in the menu (it opens and closes «⋯»).
 * The main button «Отправить клиенту» stays on the page (`est-send`: the pinned bar on a phone, the top of the content from 820).
 * Prototype v2 (#2350): the estimate is the Object template — its «⋯» is the header's `estimate-screen-more`, and «PDF», «Изменить»,
 * «SMS», «Почта», «Ссылка» are icons of the row under the header (`est-act-pdf`, `est-act-edit`…), not menu items: `estAct`
 * presses the icon when it is on the page, else opens «⋯»; a dangerous item (`revoke`) is confirmed in the template's sheet.
 */
const { pressEscUntilClosed } = require("./sheet.cjs");

const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();
// the «⋯» of the estimate: the header's (v2 Object template) or the old card's
const more = (p) => p.locator('[data-testid="estimate-screen-more"], [data-testid="est-more"]').locator("visible=true").first();

async function estMore(p, timeout = 8000) {
  await more(p).waitFor({ timeout });
}

async function openMenu(p) {
  await estMore(p);
  await more(p).getByRole("button").first().click();
  await vis(p, "menu-items").waitFor({ timeout: 3000 });
}

async function estAct(p, key) {
  await estMore(p);
  const icon = p.locator(`[data-testid="est-act-${key}"]`).locator("visible=true");
  if ((await icon.count()) > 0 && (await p.getByTestId("menu-items").locator("visible=true").count()) === 0) {
    await icon.first().click();
    return;
  }
  await openMenu(p);
  await vis(p, `est-act-${key}`).click();
  // the item runs once the menu is gone (menuPick)
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
  // a dangerous item («Отозвать ссылку», red, last) asks first — the template's confirm sheet (v2 MoreButton)
  if (DANGEROUS.has(key)) await vis(p, "tpl-confirm-yes").click();
}
const DANGEROUS = new Set(["revoke"]);

async function estHas(p, key) {
  if ((await more(p).count()) === 0) return false;
  if ((await p.locator(`[data-testid="est-act-${key}"]`).locator("visible=true").count()) > 0) return true;
  await openMenu(p);
  const has = (await p.getByTestId(`est-act-${key}`).locator("visible=true").count()) > 0;
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return has;
}

/**
 * The employee's pad on the estimate (v2 #2350): it lives in the section «Подпись» — opened by the main step «Подписать договор»
 * (`est-countersign-main`) when the pad is not on the page yet. Returns the pad.
 */
async function countersignPad(p, timeout = 8000) {
  const pad = p.getByLabel(/расписывается|signs here/i).locator("visible=true");
  if ((await pad.count()) === 0) {
    const main = p.getByTestId("est-countersign-main").locator("visible=true").first();
    await main.waitFor({ timeout });
    await main.click();
  }
  await pad.last().waitFor({ timeout });
  return pad.last();
}

/**
 * The header's ⌄ (v2 ObjectHeader): the address, the facts, the margin and «Направление» live in its panel — `estDetails(p)` opens it
 * when it is closed (`estimate-head-toggle`) and waits until it reads open.
 */
async function estDetails(p, timeout = 8000) {
  const toggle = vis(p, "estimate-head-toggle");
  await toggle.waitFor({ timeout });
  // the web drops accessibilityState: the open toggle is read by its word («Свернуть» / «Collapse»)
  const open = async () => /Свернуть|Collapse|Contraer/.test((await toggle.getAttribute("aria-label")) ?? "");
  if (!(await open())) await toggle.click();
  await p.getByTestId("estimate-head-toggle").and(p.getByLabel(/Свернуть|Collapse|Contraer/)).locator("visible=true").first().waitFor({ timeout });
}

module.exports = { estMore, estAct, estHas, countersignPad, estDetails };
