/**
 * e2e 469 — spec 56 wave 5б (#1869, scenarios С1–С12 of spec 56 §10.1), DS А7 `DateField`; every view, by testID; days are the company's (Los Angeles), so this
 * spec is also run at 11:50 PM and 12:10 AM there (E2E_NOW=2026-11-16T07:50:00Z / 08:10:00Z, the lead's condition):
 * - showcase «Поля»: the row «Дата · Завтра, …»; a tap opens «Сегодня · Завтра» and the calendar under it; «Сегодня» — one tap;
 *   a calendar day; days before the company's today are not picked; «Без даты» in an optional one;
 * - the visit form (`/job/schedule`): no day or time chips; «Завтра» from the DateField and a slot of «Начало ⌄» are saved
 *   as that company day and minute; the cancel reasons are rows with a check (radio), no «✓ » in the text.
 */
const { todayKey, addDays, dayKey, minuteOf } = require("../companyTime.cjs");
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const today = todayKey();
  const tomorrow = addDays(today, 1);

  // — the showcase
  await h.go("/settings/design-system/fields");
  await tid("showcase-date-row-button").waitFor({ timeout: 8000 });
  await tid("showcase-date-row-button").scrollIntoViewIfNeeded();
  h.expect(/Завтра/.test(await tid("showcase-date-row-button").innerText()), "С1 the row: «Дата · Завтра, …»");
  h.expect((await tid("showcase-date-row-button").getAttribute("aria-expanded")) !== "true", "С1 closed at first");
  await tid("showcase-date-row-button").click();
  await tid("showcase-date-panel").waitFor({ timeout: 4000 });
  h.expect((await tid("showcase-date-row-button").getAttribute("aria-expanded")) === "true", "С1 the row says it is open");
  // days before the company's today cannot be picked (a day of the grid before today, when the grid shows one)
  const yesterday = addDays(today, -1);
  if (await p.getByTestId(`showcase-date-day-${yesterday}`).locator("visible=true").count())
    h.expect((await tid(`showcase-date-day-${yesterday}`).getAttribute("aria-disabled")) === "true", `С3 ${yesterday} (before today) is not picked`);
  h.expect((await tid(`showcase-date-day-${today}`).getAttribute("aria-disabled")) !== "true", "С3 today is picked");
  // С9: the states differ by shape — the chosen day a filled circle, today a ring with no fill (not only the weight)
  const look = (k) => p.evaluate((id) => {
    const cell = [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.offsetParent !== null);
    // the shape: the descendant drawn as a circle (radius ≥ a third of its width)
    const dot = [cell, ...cell.querySelectorAll("div")].find((d) => { const r = d.getBoundingClientRect(); return r.width > 20 && parseFloat(getComputedStyle(d).borderTopLeftRadius) >= r.width / 3; }) || cell;
    const cs = getComputedStyle(dot);
    return { state: cell.getAttribute("data-state") || "", bg: cs.backgroundColor, ring: parseFloat(cs.borderTopWidth) || 0, label: cell.getAttribute("aria-label") };
  }, `showcase-date-day-${k}`);
  const sel = await look(tomorrow), now = await look(today);
  h.expect(/selected/.test(sel.state) && !/rgba\(0, 0, 0, 0\)|transparent/.test(sel.bg), `С9 the chosen day is a filled circle (${JSON.stringify(sel)})`);
  h.expect(/today/.test(now.state) && now.ring > 0 && /rgba\(0, 0, 0, 0\)|transparent/.test(now.bg), `С9 today is a ring with no fill (${JSON.stringify(now)})`);
  h.expect(/сегодня/.test(now.label), `С9 the screen reader hears «сегодня» (${now.label})`);
  // С11: on the month of `min` there is no «‹»; the panel is not wider than popoverW (360) — at 1280 too
  h.expect((await p.getByTestId("showcase-date-day-prev-off").locator("visible=true").count()) === 1 && (await p.getByTestId("showcase-date-day-prev").locator("visible=true").count()) === 0, "С11 no «‹» on the month of min");
  const pw = (await tid("showcase-date-panel").boundingBox()).width;
  h.expect(pw <= 360 + 1, `С11 the calendar is not wider than 360 (${pw})`);
  // С12: the calendar is one Tab stop; the arrows move the focus by a day and a week (web, WAI-ARIA date grid)
  const stops = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="showcase-date-day-2"]')].filter((e) => e.offsetParent !== null && e.getAttribute("tabindex") === "0").map((e) => e.getAttribute("data-testid")));
  h.expect(stops.length === 1 && stops[0] === `showcase-date-day-${tomorrow}`, `С12 one Tab stop — the chosen day (${stops.join(", ")})`);
  await tid(`showcase-date-day-${tomorrow}`).focus();
  await p.keyboard.press("ArrowRight");
  await p.waitForFunction((id) => document.activeElement?.getAttribute("data-testid") === id, `showcase-date-day-${addDays(tomorrow, 1)}`, { timeout: 3000 });
  await p.keyboard.press("ArrowDown");
  await p.waitForFunction((id) => document.activeElement?.getAttribute("data-testid") === id, `showcase-date-day-${addDays(tomorrow, 8)}`, { timeout: 3000 });
  h.expect(true, "С12 → a day, ↓ a week");
  await h.shot("open");
  // «Сегодня» — one tap: the value and the calendar closes
  await tid("showcase-date-today").click();
  await tid("showcase-date-panel").waitFor({ state: "hidden", timeout: 4000 });
  h.expect(/Сегодня/.test(await tid("showcase-date-row-button").innerText()), "С2 «Сегодня» in one tap");
  // С10: the focus is back on the row after a pick (web)
  await p.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "showcase-date-row-button", null, { timeout: 3000 }).then(() => h.expect(true, "С10 the focus is back on the row"), () => h.expect(false, "С10 the focus is back on the row"));
  // a calendar day: today + 5 (in this month or the next: «Следующий месяц»)
  const later = addDays(today, 5);
  await tid("showcase-date-row-button").click();
  for (let i = 0; i < 2 && (await p.getByTestId(`showcase-date-day-${later}`).locator("visible=true").count()) === 0; i++)
    await tid("showcase-date-day-next").click();
  const laterLabel = await tid(`showcase-date-day-${later}`).getAttribute("aria-label");
  await tid(`showcase-date-day-${later}`).click();
  await tid("showcase-date-panel").waitFor({ state: "hidden", timeout: 4000 });
  const dayNum = String(Number(later.slice(8)));
  h.expect(new RegExp(`\\b${dayNum}\\b`).test(await tid("showcase-date-row-button").innerText()), `С4 the calendar day (${laterLabel}) is the value`);
  // an optional one: «Без даты»
  await tid("showcase-due-row-button").click();
  await tid("showcase-due-tomorrow").click();
  h.expect(/Завтра/.test(await tid("showcase-due-row-button").innerText()), "С5 the optional field: «Завтра»");
  await tid("showcase-due-row-button").click();
  await tid("showcase-due-none").click();
  h.expect(/Без даты/.test(await tid("showcase-due-row-button").innerText()), "С5 «Без даты» empties it");

  // — the visit form: «Завтра» and a free slot are saved as the company's day and minute.
  // The company works every day here: by default Sunday is a day off (no slots, no «Начало ⌄»), and on a Saturday «Завтра»
  // was a Sunday — the spec went red every Saturday (21.11.2026, #2356). This spec checks the date field, not the hours.
  {
    const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
    const open = [480, 1080];
    raw.db.company.businessHours = { sun: open, mon: open, tue: open, wed: open, thu: open, fri: open, sat: open };
    await h.seed("octo.db.v5", raw);
  }
  await h.go("/job/schedule?jobId=j1");
  await tid("vf-date-row-button").waitFor({ timeout: 8000 });
  const old = await p.locator('[role="radiogroup"]').locator("visible=true").count();
  h.expect(old === 0, `С6 no day or time chips in the visit form (${old})`);
  await tid("vf-date-row-button").click();
  await tid("vf-date-tomorrow").click();
  await tid("vf-date-panel").waitFor({ state: "hidden", timeout: 4000 });
  h.expect(/Завтра/.test(await tid("vf-date-row-button").innerText()), "С7 the visit day: «Завтра»");
  // «Начало ⌄»: the menu of free slots; the second one
  await tid("vf-start-button").click();
  await tid("menu-items").waitFor({ timeout: 4000 });
  const items = p.getByTestId("menu-items").locator('[data-testid^="vf-start-"]').locator("visible=true");
  const ids = (await items.evaluateAll((es) => es.map((e) => e.getAttribute("data-testid")))).filter((x) => /^vf-start-\d+$/.test(x));
  h.expect(ids.length >= 2, `С7 «Начало» lists the free slots (${ids.join(", ")})`);
  const minute = Number(ids[1].slice("vf-start-".length));
  await tid(ids[1]).click();
  await h.shot("form");
  const before = (await h.db()).visits.map((v) => v.id);
  await p.getByRole("button", { name: "Запланировать", exact: true }).last().click();
  await p.waitForFunction(([n]) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits || []).length > n, [before.length], { timeout: 8000 });
  const made = (await h.db()).visits.find((v) => !before.includes(v.id));
  h.expect(dayKey(made.start) === tomorrow, `С7 saved on the company's tomorrow (${dayKey(made.start)} / ${tomorrow})`);
  h.expect(minuteOf(made.start) === minute, `С7 saved at the slot's minute (${minuteOf(made.start)} / ${minute})`);
  await p.locator('[aria-modal="true"]').last().getByRole("button", { name: "Не сейчас" }).click();

  // С10: in a sheet («Перенести»), the first Esc closes the open calendar, not the sheet; the next one the sheet
  await h.go(`/visit/${made.id}`);
  await p.getByRole("button", { name: "Перенести", exact: true }).first().click();
  await tid("vf-date-row-button").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("vf-date-today").locator("visible=true").count()) === 0, "С10 «Перенести» has one row of quick dates (its own), no «Сегодня · Завтра»");
  await tid("vf-date-row-button").click();
  await tid("vf-date-panel").waitFor({ timeout: 4000 });
  await pressEscUntilClosed(p, p.getByTestId("vf-date-panel").locator("visible=true").first());
  h.expect((await p.getByTestId("sheet-panel").locator("visible=true").count()) === 1, "С10 the first Esc closed the calendar, the sheet stays");
  // …and the next Esc closes the sheet
  await pressEscUntilClosed(p);

  // — the cancel reasons: rows with a check (radio), the text without «✓ »
  await h.go(`/visit/${made.id}`);
  await p.getByRole("button", { name: "Отменить выезд", exact: true }).first().click();
  await tid("vc-reason").waitFor({ timeout: 5000 });
  const sheet = h.sheet();
  h.expect((await sheet.getByRole("radio").count()) >= 4, "С8 the reasons are radio rows");
  h.expect(!/✓/.test(await sheet.innerText()), "С8 no «✓ » in the reasons' text");
  await sheet.getByRole("radio", { name: "Мы отменили" }).click();
  h.expect((await sheet.getByRole("radio", { name: "Мы отменили" }).getAttribute("aria-checked")) === "true", "С8 the chosen reason is checked");
  await h.shot("reasons");
};
