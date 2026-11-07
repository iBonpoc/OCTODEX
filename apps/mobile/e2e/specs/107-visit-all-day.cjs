/**
 * 3b-3 (docs/specs/17-job.md §11.1, S9/S9a): «Весь день» у выезда. The office plans a job visit for the whole day (no
 * hour, no length); the job shows «Весь день», the client is told the date only; «Перенести» keeps the switch and can
 * turn it back to a time. Kept as the company's midnight to midnight (server t03_visit_all_day, db T70–T71).
 */
exports.run = async (h) => {
  const p = h.page;
  const visit = async () => (await h.db()).visits.filter((v) => v.jobId === "j3").sort((a, b) => a.start.localeCompare(b.start)).at(-1);

  await h.go("/job/schedule?jobId=j3");
  await p.getByRole("tab", { name: "Весь день" }).locator("visible=true").first().click(); await p.waitForTimeout(300);
  h.expect((await p.getByText("Длительность", { exact: false }).locator("visible=true").count()) === 0, "no length for a whole day");
  await h.expectText(/весь день/, "the summary says «весь день»");
  await h.expectText(/Клиент увидит только дату/, "the client gets the date only");
  await h.shot("form");
  await p.getByRole("button", { name: "Запланировать", exact: true }).last().click(); await p.waitForTimeout(600);
  const v = await visit();
  h.expect(v && v.allDay === true && v.durationMin >= 1380 && v.durationMin <= 1500, `an all-day visit (${v && v.allDay} ${v && v.durationMin})`);
  await h.expectText(/в течение дня|during the day|durante el día/, "«Сообщить клиенту?» has the date, no hour (in the client's language)");
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);

  await h.go("/job/j3");
  await h.expectText(/Весь день/, "the job's visit card says «Весь день»");
  await h.shot("job");

  // «Перенести»: the switch stays on; back to a time
  await h.go(`/visit/${v.id}`);
  await p.getByRole("button", { name: "Перенести" }).first().click(); await p.waitForTimeout(500);
  const s = h.sheet();
  await h.expectText(/весь день · /, "the move form keeps «Весь день» (the summary has no hours)");
  h.expect((await s.getByText("Длительность", { exact: false }).count()) === 0, "and no length in the move form");
  await s.getByRole("tab", { name: "По времени" }).click(); await p.waitForTimeout(300);
  await s.getByRole("button", { name: "Перенести" }).last().click(); await p.waitForTimeout(600);
  const moved = (await h.db()).visits.find((x) => x.id === v.id);
  h.expect(moved && !moved.allDay && moved.durationMin < 1380, `back to a time (${moved && moved.allDay} ${moved && moved.durationMin})`);
};
