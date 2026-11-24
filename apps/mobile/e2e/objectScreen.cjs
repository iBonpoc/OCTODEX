/**
 * The Object template of prototype v2 (#2350, src/ui/templates/ObjectScreen) in a spec, by testID (CHECKS §9 №2/№26):
 * - the sections' line: `<screen>-sections-<key>` (ViewTabs) — `objSection(p, "job-screen", "invoices")`;
 * - «⋯» of the header: `<screen>-more` (MenuButton; its items in `menu-items`, each by its own testID) —
 *   `objMore(p, screen, itemId)` presses the item (a red item asks first in the template's sheet — `tpl-confirm-yes`, pressed
 *   too unless `{ confirm: false }`), `objMoreHas(p, screen, itemId)` — the item is in the menu, `objMoreText(p, screen, itemId)` its words;
 * - the main step under the header: MainStep, its testID on the button itself.
 */
const { pressEscUntilClosed } = require("./sheet.cjs");

const vis = (p, id) => p.getByTestId(id).locator("visible=true").first();

async function objSection(p, screen, key) {
  const tab = vis(p, `${screen}-sections-${key}`);
  await tab.waitFor({ timeout: 8000 });
  await tab.click();
  // the tab is selected (aria-selected) once the section is switched
  await p.locator(`[data-testid="${screen}-sections-${key}"][aria-selected="true"]`).locator("visible=true").first().waitFor({ timeout: 3000 });
}

async function openMore(p, screen) {
  await vis(p, `${screen}-more`).waitFor({ timeout: 8000 });
  await vis(p, `${screen}-more`).getByRole("button").first().click();
  await vis(p, "menu-items").waitFor({ timeout: 3000 });
}

const menuGone = (p) => p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });

async function objMore(p, screen, itemId, { confirm = true } = {}) {
  await openMore(p, screen);
  await vis(p, itemId).click();
  // the item runs once the menu is gone (menuPick)
  await menuGone(p);
  if (!confirm) return;
  // a red item asks first (MoreButton → ConfirmSheet); a dimmed one (it says why not) does not
  const yes = p.getByTestId("tpl-confirm-yes").locator("visible=true");
  try {
    await yes.first().waitFor({ timeout: 800 });
  } catch {
    return; // nothing asked: the item ran at once
  }
  await yes.first().click();
}

async function objMoreHas(p, screen, itemId) {
  if ((await p.getByTestId(`${screen}-more`).locator("visible=true").count()) === 0) return false;
  await openMore(p, screen);
  const has = (await p.getByTestId(itemId).locator("visible=true").count()) > 0;
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return has;
}

async function objMoreText(p, screen, itemId) {
  await openMore(p, screen);
  const txt = await vis(p, itemId).innerText();
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  return txt;
}

/** «＋» of the header (`<screen>-create`, MenuButton): press the item by its testID */
async function objCreate(p, screen, itemId) {
  await vis(p, `${screen}-create`).waitFor({ timeout: 8000 });
  await vis(p, `${screen}-create`).getByRole("button").first().click();
  await vis(p, "menu-items").waitFor({ timeout: 3000 });
  await vis(p, itemId).click();
  await menuGone(p);
}

/**
 * «⌄» of the header (`<head>-toggle`): opens the panel under it (the related line, the dates) when it is shut. A shut panel is clipped
 * to 0 but still in the DOM — a spec opens it before it presses anything in it.
 */
async function objOpenHead(p, head) {
  const t = vis(p, `${head}-toggle`);
  await t.waitFor({ timeout: 8000 });
  if ((await t.getAttribute("aria-label")) === "Раскрыть") await t.click();
  await p.locator(`[data-testid="${head}-toggle"][aria-label="Свернуть"]`).locator("visible=true").first().waitFor({ timeout: 3000 });
}

module.exports = { objSection, objMore, objMoreHas, objMoreText, objCreate, objOpenHead };
