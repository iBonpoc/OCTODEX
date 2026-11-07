/**
 * The filters of «План» (docs/specs/31-list-filters.md, one rule — director 07.11): «Мастер» and «Выполненные» are groups
 * of the «Фильтры» sheet; what is on is a chip under the row («Мастер: Ivan Sokolov ✕», «Выполненные ✕»).
 * planMaster(p, name) — pick a person (null: nobody, i.e. everyone); planShowDone(p, on) — show the done ones or not.
 * Found by testID; 1280 opens the group's own button, 390 / 820 the «Фильтры» button.
 */
const vis = (loc) => loc.locator("visible=true");
const sheet = (p) => p.locator('[aria-modal="true"]').last();

async function openGroup(p, key) {
  const bar = vis(p.getByTestId("filter-bar")).first();
  await bar.waitFor();
  const all = vis(bar.getByTestId("filter-button"));
  if (await all.count()) await all.first().click();
  else await vis(bar.getByTestId(`filter-group-${key}`)).first().click();
  await p.waitForTimeout(400);
}
async function done(p) {
  await sheet(p).getByText("Готово", { exact: true }).click();
  await p.waitForTimeout(400);
}

/** the chip of the person picked: «Мастер: <name>», or null */
exports.planMasterChosen = async (p) => {
  const chip = vis(p.getByTestId("filter-chosen-people"));
  return (await chip.count()) ? (await chip.first().innerText()).trim() : null;
};

exports.planMaster = async (p, name) => {
  const chip = vis(p.getByTestId("filter-chosen-people"));
  if (name === null) {
    if (await chip.count()) { await chip.first().click(); await p.waitForTimeout(400); }
    return;
  }
  await openGroup(p, "people");
  await sheet(p).getByRole("radio", { name: new RegExp(`^${name}`) }).first().click();
  await p.waitForTimeout(200);
  await done(p);
};

/** «Выполненные» on or off; returns whether it was on before */
exports.planShowDone = async (p, on) => {
  await openGroup(p, "done");
  const row = sheet(p).getByRole("checkbox", { name: /^Выполненные/ }).first();
  const was = (await row.getAttribute("aria-checked")) === "true";
  if (was !== on) { await row.click(); await p.waitForTimeout(200); }
  await done(p);
  return was;
};
