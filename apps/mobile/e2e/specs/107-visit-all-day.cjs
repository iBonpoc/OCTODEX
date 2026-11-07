/**
 * 3b-3 (docs/specs/17-job.md §11.1, S9/S9a): «Весь день» у выезда. The office plans a job visit for the whole day (no
 * hour, no length); the job shows «Весь день», the client is told the date only; «Перенести» keeps the switch and can
 * turn it back to a time. Kept as the company's midnight to midnight (server t03_visit_all_day, db T70–T71).
 */
const { atMinute, todayKey } = require("../companyTime.cjs");

exports.run = async (h) => {
  const p = h.page;
  // no midnight in this spec (CHECKS §5): at 00:21 LA a demo notice read «в пути с 12:00 AM» (another demo visit,
  // en route since the company's midnight) and failed the «no 12:00 AM» check (#297). The clock stands at noon.
  await p.clock.install({ time: new Date(atMinute(todayKey(), 12 * 60)) });
  const visit = async () => (await h.db()).visits.filter((v) => v.jobId === "j3").sort((a, b) => a.start.localeCompare(b.start)).at(-1);

  await h.go("/job/j3");
  // Linda speaks Spanish: what goes to her is Spanish only (rule 7)
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const st = JSON.parse(localStorage.getItem(k));
    st.db.customers = st.db.customers.map((c) => (c.id === "c3" ? { ...c, people: [{ id: "pp-c3-e2e", name: "Linda Alvarez", role: "main", phones: [{ number: "(310) 555-0110", label: "mobile", primary: true }], emails: [], language: "es" }] } : c));
    localStorage.setItem(k, JSON.stringify(st));
  });
  await h.go("/job/schedule?jobId=j3");
  await p.getByRole("tab", { name: "Весь день" }).locator("visible=true").first().click(); await p.waitForTimeout(300);
  h.expect((await p.getByText("Длительность", { exact: false }).locator("visible=true").count()) === 0, "no length for a whole day");
  await h.expectText(/весь день/, "the summary says «весь день»");
  await h.expectText(/Клиент увидит только дату/, "the client gets the date only");
  await h.shot("form");
  await p.getByRole("button", { name: "Запланировать", exact: true }).last().click(); await p.waitForTimeout(600);
  const v = await visit();
  h.expect(v && v.allDay === true && v.durationMin >= 1380 && v.durationMin <= 1500, `an all-day visit (${v && v.allDay} ${v && v.durationMin})`);
  await h.expectText(/durante el día/, "«Сообщить клиенту?»: the date, no hour, in Spanish");
  const sheetText = await h.sheet().innerText();
  h.expect(!/during the day|в течение дня|\d{1,2}:\d{2}/.test(sheetText.split("durante el día")[0].slice(-200)), "no English, no Russian, no hour in the message");
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);

  await h.go("/job/j3");
  await h.expectText(/Весь день/, "the job's visit card says «Весь день»");
  h.expect((await p.getByText(/12:00 AM/).locator("visible=true").count()) === 0, "no «12:00 AM» on the job");
  // Linda's timed visit of today is done: the next one of j3 is the all-day one
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const st = JSON.parse(localStorage.getItem(k));
    st.db.visits = st.db.visits.map((x) => (x.id === "v3" ? { ...x, step: "done" } : x));
    localStorage.setItem(k, JSON.stringify(st));
  });
  await h.go("/job/j3");
  const nextLine = (await h.text()).split(" | ").find((l) => /^Ближайший выезд/.test(l)) || "";
  h.expect(/Весь день/.test(nextLine) && !/12:00 AM/.test(nextLine), `«Ближайший выезд» says «Весь день» (${nextLine})`);

  // «Сегодня» of the director (the crew cards: «Дальше: …»): no «12:00 AM»
  await h.go("/today");
  // the crew cards («Дальше: …») are what shows the all-day visit — not the notices of other demo visits
  const crew = (await p.getByTestId("crew-card").locator("visible=true").allInnerTexts()).join(" | ");
  h.expect(crew.length > 0 && !/12:00 AM/.test(crew), `«Сегодня»: no «12:00 AM» on the crew cards (${crew.slice(0, 160)})`);

  // the Plan: «Весь день», no hour, not «опаздывает», no «Накладка»
  await h.go("/plan");
  await h.clickText("Лента"); await p.waitForTimeout(400);
  const feed = p.getByTestId("plan-feed").last();
  // Linda's card in the feed (other demo visits of today may be late — not ours)
  // the smallest block with her name and «Весь день» together (her timed visit of today is another card)
  const card = feed.locator("xpath=.//div[contains(., 'Linda Alvarez') and contains(., 'Весь день') and not(.//div[contains(., 'Linda Alvarez') and contains(., 'Весь день')])]");
  h.expect((await card.count()) === 1, "the all-day visit is in the Plan's feed");
  const text = await card.innerText();
  h.expect(/Весь день/.test(text), `the Plan card says «Весь день» (${text.replace(/\s+/g, " ").slice(0, 120)})`);
  h.expect(!/12:00 AM/.test(text), "no «12:00 AM» on the Plan card");
  h.expect(!/Накладка/.test(text), "no «Накладка» on the all-day visit");
  h.expect(!/[Оо]паздывает/.test(text), "not «опаздывает»");
  await h.shot("plan");
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
