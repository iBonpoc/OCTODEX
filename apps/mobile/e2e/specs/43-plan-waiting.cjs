const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * The Plan tab for the office (docs/specs/03 §7.2, wave П3b; story map S8b / S9a — the screen side).
 * Both sides of S9a on the screen: the only visit of a job is cancelled → the job is in «Ждут даты» in the Plan →
 * «Запланировать» with «Другая дата» (the month calendar) → it leaves the block and is in the plan that day.
 * «Чей план» chips filter by person; «+» books an inspection at a property (the form shows the address).
 * A tech sees neither «Ждут даты», nor the chips, nor «+». One yellow per screen and per sheet (rule 2).
 */
const { expectOneAccent } = require("../accent.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  let db = await h.db();
  const j2 = db.jobs.find((j) => j.id === "j2");
  const prop = db.properties.find((x) => x.id === j2.propertyId);
  const client = db.customers.find((c) => c.id === prop.customerId);

  // S9a: cancel the only visit of j2 → the job waits for a date
  await h.go("/visit/v2");
  await p.getByRole("button", { name: "Отменить выезд", exact: true }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Мы отменили" }).click();
  await h.sheet().getByRole("button", { name: "Отменить выезд", exact: true }).last().click(); await p.waitForTimeout(800);

  // the Plan: «Ждут даты · 1» with the client, the job and «Запланировать»
  await h.go("/plan");
  await h.expectText(/Ждут даты · 1/, "the job is in «Ждут даты»");
  await h.expectText(new RegExp(client.name), "the waiting card names the client");
  await expectOneAccent(h, "the Plan (office)");

  // «Запланировать» → the visit form; «Другая дата» → next month, the 15th
  await p.getByRole("button", { name: "Запланировать", exact: true }).first().click(); await p.waitForTimeout(600);
  h.expect(/\/job\/schedule/.test(p.url()), `the form for the job opens (${p.url()})`);
  await p.getByRole("button", { name: "Другая дата" }).first().click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Вперёд" }).last().click(); await p.waitForTimeout(200);
  // next month of the company's calendar, the 15th (a day key: labelled in UTC, as the calendar does — П4b)
  const [ny, nm] = todayKey().split("-").map(Number);
  const nextKey = new Date(Date.UTC(ny, nm, 15)).toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }).format(new Date(`${nextKey}T12:00:00Z`));
  await p.getByRole("button", { name: label, exact: true }).click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Запланировать", exact: true }).last().click(); await p.waitForTimeout(600);
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click(); await p.waitForTimeout(400);
  db = await h.db();
  const v = db.visits.find((x) => x.jobId === "j2");
  h.expect(v && dayKey(v.start) === nextKey, `planned on the picked day of the company (${v && v.start})`);
  h.expect(db.jobs.find((j) => j.id === "j2").status === "scheduled", "S9: the job is scheduled again");
  await h.go("/plan");
  h.expect(!/Ждут даты/.test(await h.text()), "the job left «Ждут даты»");

  // «Чей план»: Ivan → only his column; «Все» → everyone
  await p.getByRole("radio", { name: "Ivan", exact: true }).click(); await p.waitForTimeout(300);
  h.expect(!/Alex Petrov/.test(await h.text()) && /Ivan Sokolov/.test(await h.text()), "the chip shows one person");
  await p.getByRole("radio", { name: "Все", exact: true }).click(); await p.waitForTimeout(300);
  h.expect(/Alex Petrov/.test(await h.text()), "«Все» shows everyone again");

  // «+» → an inspection at a property; the form shows its address
  const visits0 = db.visits.length;
  await p.getByRole("button", { name: "Записать в план", exact: true }).click(); await p.waitForTimeout(400);
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
  h.expect((await p.getByRole("radio", { name: "Все", exact: true }).count()) === 0, "tech: no «Чей план» chips");
  h.expect((await p.getByRole("button", { name: "Записать в план", exact: true }).count()) === 0, "tech: no «+»");
  h.expect(!/Ждут даты/.test(await h.text()), "tech: no «Ждут даты»");
};
