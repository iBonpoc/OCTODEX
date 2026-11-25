/**
 * The List template of prototype v2 (#2350, src/ui/templates/ListScreen) in a spec, by testID (CHECKS §9 №2/№26):
 * - «＋» of the header: `<screen>-create` (MenuButton) — `listCreate(p, "clients", "clients-create-new")` presses the item;
 * - the chips strip: `<screen>-chips`, each chip a radio named by its words («Все 7») — `listChip(p, "clients", /^Все \d+$/)`;
 * - the rows: GroupRow with its own testID (`client-row-<id>`, `lead-row-<id>`) — `listRow(p, "client-row-c1")`.
 */
const vis = (loc) => loc.locator("visible=true");

async function listCreate(p, screen, itemId) {
  await vis(p.getByTestId(`${screen}-create`)).first().getByRole("button").first().click();
  await vis(p.getByTestId("menu-items")).first().waitFor({ timeout: 3000 });
  await vis(p.getByTestId(itemId)).first().click();
}

/** the chip of the strip whose words match (a radio) */
const listChip = (p, screen, re) => vis(p.getByTestId(`${screen}-chips`)).first().getByRole("radio", { name: re }).first();

/** the words of every chip of the strip, in order */
const listChips = async (p, screen) => vis(p.getByTestId(`${screen}-chips`)).first().getByRole("radio").allInnerTexts();

const listRow = (p, id) => vis(p.getByTestId(id)).first();

module.exports = { listCreate, listChip, listChips, listRow };
