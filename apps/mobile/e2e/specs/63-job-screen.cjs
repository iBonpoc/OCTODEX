/**
 * Wave 3a → the «Объект» template (LAYOUT-RULES §3, #2350): «Работа JOB-0001», the head, one next step, the sections' line
 * «Обзор · Выезды · Сметы · Счета · Расходы · Заказы · Фото · Заметки».
 * - the main step goes by the next open visit (Начать выезд → the visit, its reason «Ближайший выезд» under it; the rest in «⋯»);
 * - Расходы: the office sees «Прибыль»; Счета: the technician sees «К оплате» and no profit (no «Расходы» for him);
 * - Заметки: a note added in the field shows under «Заметки», not under «Звонки».
 */
const { atMinute, todayKey } = require("../companyTime.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;
const { objMoreText } = require("../objectScreen.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/visits");
  const db = await h.db();
  const job = db.jobs.find((j) => j.id === "j2");
  await p.evaluate((v) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = [...raw.db.visits.filter((x) => x.jobId !== v.jobId), v];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, { id: "e2e63", jobId: job.id, propertyId: job.propertyId, kind: "install", techId: db.me, assigneeIds: [db.me], start: atMinute(todayKey(), 23 * 60), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 });

  await setRole(h, "director");
  await h.go(`/job/${job.id}`);
  // v2 (#2350): the job's number is in «⋯» (wireframe №6 «номер JOB — в ⋯»), the title is the job's name
  const num = await objMoreText(p, "job-screen", "job-act-number");
  h.expect(new RegExp(`Работа ${job.number}`).test(num), `«⋯» names «Работа ${job.number}» (${num})`);
  for (const key of ["overview", "visits", "estimates", "invoices", "expenses", "photos", "notes"]) h.expect((await p.getByTestId(`job-screen-sections-${key}`).locator("visible=true").count()) === 1, `section «${key}» in the line`);
  // the «Сейчас» card: «Ближайший выезд» over the visit, the one main step «Начать выезд» inside
  const now = await p.getByTestId("job-now").locator("visible=true").first().innerText();
  h.expect(/Ближайший выезд/i.test(now), `the next visit names the «Сейчас» card (${now.replace(/\n/g, " | ")})`);
  h.expect((await p.getByTestId("job-next-start").locator("visible=true").count()) === 1, "one main step «Начать выезд»");
  await h.shot("details");

  // Расходы: the office sees the profit
  await p.getByTestId("job-screen-sections-expenses").locator("visible=true").click();
  await h.expectText(/Прибыль/, "office: profit on «Расходы»");
  await h.shot("money");

  // Заметки: add a note → it is under «Заметки», not under «Звонки»
  await p.getByTestId("job-screen-sections-notes").locator("visible=true").click();
  await p.getByPlaceholder("Собака во дворе, где парковаться…").locator("visible=true").fill("Ключ у соседа");
  await p.getByRole("button", { name: "Добавить заметку", exact: true }).locator("visible=true").first().click();
  await p.getByTestId("job-history-filter").locator("visible=true").first().getByRole("radio", { name: "Заметки", exact: true }).click(); // the list's lane (spec 56 wave 5а)
  await h.expectText(/Заметка[\s\S]*Ключ у соседа/, "the note in the history under «Заметки»");
  h.expect((await p.getByText("Ключ у соседа").locator("visible=true").count()) === 1, "the note is shown once (no second notes list)");
  await p.getByTestId("job-history-filter").locator("visible=true").first().getByRole("radio", { name: "Звонки", exact: true }).click(); // the history filter is the list's lane (spec 56 wave 5а)
  await h.expectText(/Событий пока нет/, "no calls on this job");
  h.expect(!/Ключ у соседа/.test(await h.text()), "«Звонки» does not show notes");
  await h.shot("history");

  // the technician: «К оплате», no profit; «Начать выезд» opens his visit
  await setRole(h, "tech");
  await h.go(`/job/${job.id}`);
  h.expect((await p.getByTestId("job-screen-sections-expenses").count()) === 0, "tech: no «Расходы»");
  await p.getByTestId("job-screen-sections-invoices").locator("visible=true").click();
  await h.expectText(/К оплате/, "tech: «К оплате»");
  h.expect(!/Прибыль/.test(await h.text()), "tech: no profit");
  // B4: each invoice of his job is a compact card with what is left to collect — not the invoice total
  const usd = (c) => (c % 100 ? `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : `$${(c / 100).toLocaleString("en-US")}`);
  h.expect(db.invoices.some((i) => i.jobId === job.id), "the job has an invoice (the check below is not blind)");
  for (const inv of db.invoices.filter((i) => i.jobId === job.id)) {
    const card = p.getByTestId(`job-invoice-${inv.id}`).locator("visible=true");
    await card.first().waitFor({ timeout: 5000 });
    const txt = await card.first().innerText();
    const due = Math.max(0, inv.totalCents - inv.paidCents);
    h.expect(txt.includes(usd(due)), `tech: the invoice card shows what is left (${usd(due)}): ${txt.replace(/\n/g, " | ")}`);
    if (due !== inv.totalCents) h.expect(!txt.includes(usd(inv.totalCents)), `tech: no invoice total (${usd(inv.totalCents)})`);
  }
  await p.getByTestId("job-screen-sections-overview").locator("visible=true").click();
  await p.getByTestId("job-next-start").locator("visible=true").first().click();
  await p.waitForURL(/\/visit\/e2e63/, { timeout: 5000 });
  h.expect(path(h) === "/visit/e2e63", `«Начать» → the next visit (${p.url()})`);
};
