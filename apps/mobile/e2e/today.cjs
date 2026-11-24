/**
 * «Главная» v2 (#2350): the period switch, «Получено» and the funnel live in the folded «Подробнее» (`today-details`, the choice is
 * kept in `octo.todayDetails.v1`). openDetails(page) opens it when shut and waits for its body; the parts are found by testID:
 * the tabs `today-period-<today|week|month>`, the funnel rows `today-f-<leads|sent|signed>`, the columns `received-chart`.
 */
async function openDetails(page) {
  const head = page.getByTestId("today-details").locator("visible=true").first();
  await head.waitFor();
  // RN-web does not write aria-expanded on this button: the body is there or not
  const body = page.getByTestId("today-details-body").locator("visible=true");
  if (!(await body.count())) await head.click();
  await body.first().waitFor();
}

/** a tab of the period switch (Segmented `today-period`): "today" | "week" | "month" */
async function period(page, key) {
  await openDetails(page);
  const tab = page.getByTestId(`today-period-${key}`).locator("visible=true").first();
  await tab.click();
  // the chosen period is kept (usePersistentState `octo.todayPeriod.v1`); the tab has no aria-selected on RN-web
  await page.waitForFunction((k) => localStorage.getItem("octo.todayPeriod.v1") === JSON.stringify(k), key);
}

module.exports = { openDetails, period };
