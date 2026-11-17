/**
 * e2e 469 — spec 56 wave 5б (#1869), DS А7 `DateField`; every view, by testID; days are the company's (Los Angeles), so this
 * spec is also run at 11:50 PM and 12:10 AM there (E2E_NOW=2026-11-16T07:50:00Z / 08:10:00Z, the lead's condition):
 * - showcase «Поля»: the row «Дата · Завтра, …»; a tap opens «Сегодня · Завтра» and the calendar under it; «Сегодня» — one tap;
 *   a calendar day; days before the company's today are not picked; «Без даты» in an optional one;
 * - the visit form (`/job/schedule`): no day or time chips; «Завтра» from the DateField and a slot of «Начало ⌄» are saved
 *   as that company day and minute; the cancel reasons are rows with a check (radio), no «✓ » in the text.
 */
const { todayKey, addDays, dayKey, minuteOf } = require("../companyTime.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const today = todayKey();
  const tomorrow = addDays(today, 1);

  // — the showcase
  await h.go("/settings/design-system/fields");
  await tid("showcase-date-row-button").waitFor({ timeout: 8000 });
  await tid("showcase-date-row-button").scrollIntoViewIfNeeded();
  h.expect(/Завтра/.test(await tid("showcase-date-row-button").innerText()), "the row: «Дата · Завтра, …»");
  h.expect((await tid("showcase-date-row-button").getAttribute("aria-expanded")) !== "true", "closed at first");
  await tid("showcase-date-row-button").click();
  await tid("showcase-date-panel").waitFor({ timeout: 4000 });
  h.expect((await tid("showcase-date-row-button").getAttribute("aria-expanded")) === "true", "the row says it is open");
  // days before the company's today cannot be picked (a day of the grid before today, when the grid shows one)
  const yesterday = addDays(today, -1);
  if (await p.getByTestId(`showcase-date-day-${yesterday}`).locator("visible=true").count())
    h.expect((await tid(`showcase-date-day-${yesterday}`).getAttribute("aria-disabled")) === "true", `${yesterday} (before today) is not picked`);
  h.expect((await tid(`showcase-date-day-${today}`).getAttribute("aria-disabled")) !== "true", "today is picked");
  await h.shot("open");
  // «Сегодня» — one tap: the value and the calendar closes
  await tid("showcase-date-today").click();
  await tid("showcase-date-panel").waitFor({ state: "hidden", timeout: 4000 });
  h.expect(/Сегодня/.test(await tid("showcase-date-row-button").innerText()), "«Сегодня» in one tap");
  // a calendar day: today + 5 (in this month or the next: «Вперёд»)
  const later = addDays(today, 5);
  await tid("showcase-date-row-button").click();
  for (let i = 0; i < 2 && (await p.getByTestId(`showcase-date-day-${later}`).locator("visible=true").count()) === 0; i++)
    await tid("showcase-date-panel").getByRole("button", { name: "Вперёд" }).click();
  const laterLabel = await tid(`showcase-date-day-${later}`).getAttribute("aria-label");
  await tid(`showcase-date-day-${later}`).click();
  await tid("showcase-date-panel").waitFor({ state: "hidden", timeout: 4000 });
  const dayNum = String(Number(later.slice(8)));
  h.expect(new RegExp(`\\b${dayNum}\\b`).test(await tid("showcase-date-row-button").innerText()), `the calendar day (${laterLabel}) is the value`);
  // an optional one: «Без даты»
  await tid("showcase-due-row-button").click();
  await tid("showcase-due-tomorrow").click();
  h.expect(/Завтра/.test(await tid("showcase-due-row-button").innerText()), "the optional field: «Завтра»");
  await tid("showcase-due-row-button").click();
  await tid("showcase-due-none").click();
  h.expect(/Без даты/.test(await tid("showcase-due-row-button").innerText()), "«Без даты» empties it");

  // — the visit form: «Завтра» and a free slot are saved as the company's day and minute
  await h.go("/job/schedule?jobId=j1");
  await tid("vf-date-row-button").waitFor({ timeout: 8000 });
  const old = await p.locator('[role="radiogroup"]').locator("visible=true").count();
  h.expect(old === 0, `no day or time chips in the visit form (${old})`);
  await tid("vf-date-row-button").click();
  await tid("vf-date-tomorrow").click();
  await tid("vf-date-panel").waitFor({ state: "hidden", timeout: 4000 });
  h.expect(/Завтра/.test(await tid("vf-date-row-button").innerText()), "the visit day: «Завтра»");
  // «Начало ⌄»: the menu of free slots; the second one
  await tid("vf-start-button").click();
  await tid("menu-items").waitFor({ timeout: 4000 });
  const items = p.getByTestId("menu-items").locator('[data-testid^="vf-start-"]').locator("visible=true");
  const ids = (await items.evaluateAll((es) => es.map((e) => e.getAttribute("data-testid")))).filter((x) => /^vf-start-\d+$/.test(x));
  h.expect(ids.length >= 2, `«Начало» lists the free slots (${ids.join(", ")})`);
  const minute = Number(ids[1].slice("vf-start-".length));
  await tid(ids[1]).click();
  await h.shot("form");
  const before = (await h.db()).visits.map((v) => v.id);
  await p.getByRole("button", { name: "Запланировать", exact: true }).last().click();
  await p.waitForFunction(([n]) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits || []).length > n, [before.length], { timeout: 8000 });
  const made = (await h.db()).visits.find((v) => !before.includes(v.id));
  h.expect(dayKey(made.start) === tomorrow, `saved on the company's tomorrow (${dayKey(made.start)} / ${tomorrow})`);
  h.expect(minuteOf(made.start) === minute, `saved at the slot's minute (${minuteOf(made.start)} / ${minute})`);
  await p.locator('[aria-modal="true"]').last().getByRole("button", { name: "Не сейчас" }).click();

  // — the cancel reasons: rows with a check (radio), the text without «✓ »
  await h.go(`/visit/${made.id}`);
  await p.getByRole("button", { name: "Отменить выезд", exact: true }).first().click();
  await tid("vc-reason").waitFor({ timeout: 5000 });
  const sheet = h.sheet();
  h.expect((await sheet.getByRole("radio").count()) >= 4, "the reasons are radio rows");
  h.expect(!/✓/.test(await sheet.innerText()), "no «✓ » in the reasons' text");
  await sheet.getByRole("radio", { name: "Мы отменили" }).click();
  h.expect((await sheet.getByRole("radio", { name: "Мы отменили" }).getAttribute("aria-checked")) === "true", "the chosen reason is checked");
  await h.shot("reasons");
};
