/**
 * e2e 511 — #2123: «Разбор дел» → «Позже» → «Выбрать дату…» — a day of one's own through DateField (DS А7, #2057).
 * С1 ДАНО диспетчер, дело наверху в «Разборе дел»; КОГДА «Позже» → «Выбрать дату…» → день через 10 дней → «Отложить»;
 *    ТОГДА дела нет наверху, тост «Отложено до …» с «Отменить», отложено до 00:00 того дня (сохранено, не память экрана);
 *    «Отменить» возвращает дело.
 * С2 ДАНО шторка «Выбрать дату…»; ТОГДА сегодня и вчера не выбираются, «Отложить» неактивна, пока день не выбран.
 * Every view; the company's days through companyTime.cjs (the clock is noon of the company's day).
 */
const { todayKey, addDays } = require("../companyTime.cjs");

const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.seed("octo.role.v1", "dispatcher");
  await h.go("/triage");
  const top = () => p.locator('[data-testid^="triage-top-"]').locator("visible=true").first();
  await top().waitFor({ timeout: 8000 });
  const id0 = (await top().getAttribute("data-testid")).slice("triage-top-".length);
  const today = todayKey();
  const yesterday = addDays(today, -1);
  const day10 = addDays(today, 10);

  // С2: the sheet — today and yesterday are not picked, «Отложить» waits for a day
  await tid("triage-later").getByRole("button").click();
  await tid("triage-later-pick").click();
  await tid("triage-pick-date-row-button").waitFor({ timeout: 8000 });
  h.expect((await tid("triage-pick-do").getAttribute("aria-disabled")) === "true", "С2 «Отложить» is off until a day is picked");
  await tid("triage-pick-date-row-button").click();
  await tid("triage-pick-date-panel").waitFor({ timeout: 4000 });
  h.expect((await p.getByTestId("triage-pick-date-today").count()) === 0, "С2 no «Сегодня» among the quick days");
  for (const k of [today, yesterday])
    if (await p.getByTestId(`triage-pick-date-day-${k}`).locator("visible=true").count())
      h.expect((await tid(`triage-pick-date-day-${k}`).getAttribute("aria-disabled")) === "true", `С2 ${k} is not picked`);
  await h.shot("pick-sheet");

  // С1: a day 10 days on (this month or the next)
  for (let i = 0; i < 2 && (await p.getByTestId(`triage-pick-date-day-${day10}`).locator("visible=true").count()) === 0; i++) await tid("triage-pick-date-day-next").click();
  await tid(`triage-pick-date-day-${day10}`).click();
  await tid("triage-pick-date-panel").waitFor({ state: "hidden", timeout: 4000 });
  h.expect((await tid("triage-pick-do").getAttribute("aria-disabled")) !== "true", "С1 «Отложить» is on with a day");
  await tid("triage-pick-do").click();
  await p.getByTestId("toast-text").filter({ hasText: /Отложено до/ }).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId(`triage-top-${id0}`).locator("visible=true").count()) === 0, `С1 «${id0}» is not on top`);
  // put off until that day: later than 9 days on, earlier than 11 (00:00 of the day in the company's zone)
  await p.waitForFunction(
    ([k, id]) => {
      const s = (JSON.parse(localStorage.getItem(k) || "null")?.db?.attentionSnoozes ?? []).find((x) => x.itemId === id);
      const d = s ? (Date.parse(s.until) - Date.now()) / 86400000 : 0;
      return d > 9 && d < 11;
    },
    [KEY, id0],
    { timeout: 8000 },
  );
  await h.shot("put-off");

  // «Отменить» brings it back
  await tid("toast-undo").click();
  await tid(`triage-top-${id0}`).waitFor({ timeout: 8000 });
  h.expect(true, "С1 «Отменить»: the reason is back on top");
};
