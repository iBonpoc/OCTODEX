/**
 * e2e 486 (#2066) — «Клиента нет дома» (story map S10 «Выезд», S9a; docs/specs/03 §4.1). Six views (h.layout).
 * С1 ДАНО the tech on site at the job's only visit, КОГДА «Клиента нет дома» → a note → «Отметить», ТОГДА the sheet asked
 *    first (rule 5), the visit leaves the tech's day, it is kept with the reason and the note, the job waits for a date.
 * С2 ДАНО that no-show, КОГДА the dispatcher opens «Разобрать», ТОГДА the card «клиента не было дома — перенести выезд».
 * С3 ДАНО a visit at work, ТОГДА no «Клиента нет дома» (the client was there).
 * The demo's own data, changed in the local base from a page without the app (h.seed).
 */
const { sheetGone } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/more");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const db = raw.db;
  const job = db.jobs.find((j) => j.propertyId && db.properties.some((x) => x.id === j.propertyId && db.customers.some((c) => c.id === x.customerId)));
  h.expect(!!job, "the demo has a job of a client");
  const client = db.customers.find((c) => c.id === db.properties.find((x) => x.id === job.propertyId).customerId);
  job.status = "scheduled";
  const base = { jobId: job.id, techId: db.me, assigneeIds: [db.me], start: new Date(Date.now() - 10 * 60_000).toISOString(), durationMin: 120, scope: [], checklist: [], photos: [], amountDueCents: 0 };
  db.visits = [
    ...db.visits.filter((v) => v.jobId !== job.id),
    { ...base, id: "e2e-486-door", step: "on_site" },
  ];
  db.cancelledVisits = (db.cancelledVisits ?? []).filter((v) => v.jobId !== job.id);
  // С3: another job, its visit at work
  const other = db.jobs.find((j) => j.id !== job.id && j.propertyId);
  db.visits = [...db.visits.filter((v) => v.jobId !== other.id), { ...base, jobId: other.id, id: "e2e-486-work", step: "working" }];
  await h.seed("octo.db.v5", raw);
  await h.seed("octo.role.v1", "tech");

  // С3: at work — no button
  await h.go("/visit/e2e-486-work");
  await p.getByTestId("visit-screen").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("visit-no-show").count()) === 0, `С3 ${JSON.stringify(h.layout)}: no «Клиента нет дома» at work`);

  // С1: on site — «Не отмечать» leaves the visit as it is
  await h.go("/visit/e2e-486-door");
  await p.getByTestId("visit-no-show").locator("visible=true").first().getByRole("button").click();
  let sheet = h.sheet();
  await sheet.getByTestId("no-show-sheet").waitFor({ timeout: 5000 });
  await sheet.getByTestId("no-show-keep").getByRole("button").click();
  await sheetGone(p);
  h.expect((await h.db()).visits.some((v) => v.id === "e2e-486-door"), `С1 ${JSON.stringify(h.layout)}: «Не отмечать» — the visit stays`);
  // the sheet, a note, «Отметить»
  await p.getByTestId("visit-no-show").locator("visible=true").first().getByRole("button").click();
  sheet = h.sheet();
  await sheet.getByTestId("no-show-sheet").waitFor({ timeout: 5000 });
  await h.shot("no-show-sheet");
  await sheet.getByRole("textbox").first().fill("Left a note on the door");
  await sheet.getByTestId("no-show-confirm").getByRole("button").click();
  await sheetGone(p);
  await h.expectText(/Отмечено: клиента нет дома/, `С1 ${JSON.stringify(h.layout)}: the toast`);
  await p.waitForFunction(() => {
    const d = JSON.parse(localStorage.getItem("octo.db.v5") || "{}").db;
    return d && !d.visits.some((v) => v.id === "e2e-486-door");
  }, null, { timeout: 8000 });
  const after = await h.db();
  const gone = (after.cancelledVisits ?? []).find((v) => v.id === "e2e-486-door");
  h.expect(gone && gone.cancelReason === "no_show" && gone.cancelText === "Left a note on the door" && gone.cancelledBy === after.me,
    `С1 ${JSON.stringify(h.layout)}: kept with the reason, the note and who (${JSON.stringify(gone && { r: gone.cancelReason, t: gone.cancelText })})`);
  h.expect(after.jobs.find((j) => j.id === job.id).status === "unscheduled", `С1 ${JSON.stringify(h.layout)}: the job waits for a date`);

  // С2: the dispatcher's queue
  await h.seed("octo.role.v1", "dispatcher");
  await h.go("/triage");
  await h.expectText(new RegExp(`${client.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}: клиента не было дома — перенести выезд`),
    `С2 ${JSON.stringify(h.layout)}: «перенести выезд» for the office`);
  await h.shot("dispatcher-triage");
};
