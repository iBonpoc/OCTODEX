const { planMaster, planMasterChosen } = require("../planFilters.cjs");
const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * The Plan tab for the office (docs/specs/03 §7.2, wave П3b; story map S8b / S9a — the screen side).
 * Both sides of S9a on the screen: the only visit of a job is cancelled → the job is in «Ждут даты» in the Plan →
 * «Запланировать» with «Другая дата» (the month calendar) → it leaves the block and is in the plan that day.
 * «Чей план» chips filter by person; «+» books an inspection at a property (the form shows the address).
 * A tech sees neither «Ждут даты», nor the chips, nor «+». One yellow per screen and per sheet (rule 2).
 */
const { expectOneAccent } = require("../accent.cjs");
const { visitAct } = require("../visitScreen.cjs");
// v2 «Календарь»: «＋» of the header (`plan-create`) — its items by testID
const planCreate = async (p, item) => {
  await p.getByTestId("plan-create").locator("visible=true").first().getByRole("button").first().click();
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ timeout: 3000 });
  await p.getByTestId(item).locator("visible=true").first().click();
};

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  let db = await h.db();
  const j2 = db.jobs.find((j) => j.id === "j2");
  const prop = db.properties.find((x) => x.id === j2.propertyId);
  const client = db.customers.find((c) => c.id === prop.customerId);

  // S9a: cancel the only visit of j2 → the job waits for a date
  await h.go("/visit/v2");
  // v2: «Отменить выезд» is the red item of the header's «⋯»
  await visitAct(p, "visit-act-cancel"); await p.waitForTimeout(400);
  await h.sheet().getByRole("radio", { name: "Мы отменили" }).click(); // the reason — a row with a check (spec 56 wave 5б)
  await h.sheet().getByRole("button", { name: "Отменить выезд", exact: true }).last().click(); await p.waitForTimeout(800);

  // the Plan: v2 — the row «Без даты · 1» opens the sheet «Ждут даты · 1» with the client, the job and «Запланировать»
  await h.go("/plan");
  const undated = p.getByTestId("plan-undated").locator("visible=true").first();
  await undated.waitFor({ timeout: 8000 });
  h.expect(/Без даты · 1/.test(await undated.innerText()), `the job is «Без даты · 1»: ${await undated.innerText()}`);
  await expectOneAccent(h, "the Plan (office)");
  await undated.getByRole("button").first().click();
  await p.getByTestId("plan-waiting-sheet").locator("visible=true").first().waitFor({ timeout: 5000 });
  await h.expectText(/Ждут даты · 1/, "the sheet «Ждут даты»");
  h.expect(new RegExp(client.name).test(await h.sheet().innerText()), "the waiting row names the client");

  // «Запланировать» → the visit form; «Другая дата» → next month, the 15th
  await p.getByTestId("plan-waiting-schedule-j2").locator("visible=true").first().click(); await p.waitForTimeout(600);
  h.expect(/\/job\/schedule/.test(p.url()), `the form for the job opens (${p.url()})`);
  await p.getByTestId("vf-date-row-button").locator("visible=true").first().click(); // the day — DateField (spec 56 wave 5б)
  await p.getByTestId("vf-date-panel").locator("visible=true").first().waitFor({ timeout: 4000 });
  await p.getByTestId("vf-date-day-next").locator("visible=true").first().click(); // «Следующий месяц»
  // next month of the company's calendar, the 15th (a day key: labelled in UTC, as the calendar does — П4b)
  const [ny, nm] = todayKey().split("-").map(Number);
  const nextKey = new Date(Date.UTC(ny, nm, 15)).toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${nextKey}T12:00:00Z`));
  const cell = p.getByTestId(`vf-date-day-${nextKey}`).locator("visible=true").first();
  h.expect((await cell.getAttribute("aria-label")) === label, `the day says its full date (${label})`);
  await cell.click();
  await p.getByRole("button", { name: "Запланировать", exact: true }).last().click(); await p.waitForTimeout(600);
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click(); await p.waitForTimeout(400);
  db = await h.db();
  const v = db.visits.find((x) => x.jobId === "j2");
  h.expect(v && dayKey(v.start) === nextKey, `planned on the picked day of the company (${v && v.start})`);
  h.expect(db.jobs.find((j) => j.id === "j2").status === "scheduled", "S9: the job is scheduled again");
  await h.go("/plan");
  await p.getByTestId("plan").locator("visible=true").first().waitFor();
  h.expect((await p.getByTestId("plan-undated").count()) === 0 && !/Без даты/.test(await h.text()), "the job left «Без даты»");

  // «Мастер» in «Фильтры» (spec 31): Ivan → only his column, a chip «Мастер: Ivan Sokolov ✕»; ✕ → everyone
  await planMaster(p, "Ivan");
  h.expect((await planMasterChosen(p)) === "Мастер: Ivan Sokolov", "the chip says who is picked");
  // the visits shown (v2 TimeSlot rows `plan-row-<id>`; 820 / 1280 — the board's cards by person)
  const shown = async () => {
    const d = await h.db();
    const rows = await p.locator('[data-testid^="plan-row-"]').locator("visible=true").evaluateAll((els) => els.map((e) => e.dataset.testid.slice(9)));
    return rows.map((id) => d.visits.find((x) => x.id === id)).filter(Boolean);
  };
  const who = (x) => (x.assigneeIds?.length ? x.assigneeIds : [x.techId]);
  if (h.layout.width < 820) {
    const only = await shown();
    h.expect(only.length > 0 && only.every((x) => who(x).includes("m-ivan")), `one person's plan: ${only.map((x) => x.id).join(",")}`);
  } else h.expect(!/Alex Petrov/.test(await h.text()) && /Ivan Sokolov/.test(await h.text()), "one person's column");
  await planMaster(p, null);
  if (h.layout.width < 820) {
    const all = await shown();
    h.expect(all.some((x) => !who(x).includes("m-ivan")), `✕ shows everyone again: ${all.map((x) => x.id).join(",")}`);
  } else h.expect(/Alex Petrov/.test(await h.text()), "✕ shows everyone again");

  // «+» → an inspection at a property; the form shows its address
  const visits0 = db.visits.length;
  // the Plan's «＋» (v2: the header's menu) → «Выезд или осмотр»
  await planCreate(p, "plan-create-visit"); await p.waitForTimeout(400);
  await h.expectText(/Что записать/, "the «+» sheet");
  await h.sheet().getByPlaceholder("Имя или адрес").fill(client.name.split(" ")[0]);
  await p.waitForTimeout(200);
  await h.sheet().getByRole("button", { name: new RegExp(client.name) }).first().click(); await p.waitForTimeout(500);
  await h.expectText(new RegExp(prop.address), "the form shows the address of the property");
  await expectOneAccent(h, "the inspection form from «+»", '[aria-modal="true"]');
  await h.sheet().getByRole("button", { name: "Записать на оценку" }).last().click(); await p.waitForTimeout(600);
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click(); await p.waitForTimeout(400);
  db = await h.db();
  h.expect(db.visits.length === visits0 + 1 && db.visits.some((x) => x.kind === "inspection" && x.propertyId === prop.id && !x.jobId), "an inspection at the property, without a job");

  // a tech: only his visits, no «Ждут даты», no chips, no «+»
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/plan");
  h.expect((await p.getByTestId("filter-group-people").locator("visible=true").count()) === 0 && !/Мастер/.test(await h.text()), "tech: no «Мастер»");
  h.expect((await p.getByTestId("plan-create").locator("visible=true").count()) === 0, "tech: no «+»");
  h.expect((await p.getByTestId("plan-undated").count()) === 0 && !/Без даты/.test(await h.text()), "tech: no «Без даты»");
};
