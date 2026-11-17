/**
 * The visit form's day and start (spec 56 wave 5б, DS А7): the day is a `DateField` row — tap it, then the day of the month
 * calendar under it (`vf-date-day-YYYY-MM-DD`, the company's calendar); the start is a `SelectField` «Начало ⌄» of the free
 * slots (`vf-start-<minute>`). `scope` — the sheet, when the form is in one (the menu of «Начало» is the page's).
 */
const { todayKey, addDays } = require("./companyTime.cjs");

async function pickVisitDay(page, offset, scope) {
  const root = scope || page;
  const key = addDays(todayKey(), offset);
  const vis = (loc) => loc.locator("visible=true").first();
  if ((await root.getByTestId("vf-date-panel").locator("visible=true").count()) === 0) await vis(root.getByTestId("vf-date-row-button")).click();
  const panel = vis(root.getByTestId("vf-date-panel"));
  await panel.waitFor({ timeout: 4000 });
  // a day beyond this month: the calendar's «Вперёд» until it is drawn
  for (let i = 0; i < 3 && (await root.getByTestId(`vf-date-day-${key}`).locator("visible=true").count()) === 0; i++) {
    await panel.getByRole("button", { name: /^(Вперёд|Next|Siguiente)$/ }).first().click();
  }
  await vis(root.getByTestId(`vf-date-day-${key}`)).click();
  await panel.waitFor({ state: "hidden", timeout: 4000 });
  return key;
}

async function pickVisitStart(page, minute, scope) {
  const root = scope || page;
  await root.getByTestId("vf-start-button").locator("visible=true").first().click();
  await page.getByTestId(`vf-start-${minute}`).locator("visible=true").first().click();
}

module.exports = { pickVisitDay, pickVisitStart };
