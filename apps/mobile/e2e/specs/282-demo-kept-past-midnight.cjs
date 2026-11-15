/**
 * e2e 282 — the demo keeps what the person made, past midnight in Los Angeles (12.11, К1: the founder's measurement was
 * wiped). The bug: the demo's record was good only for the day it was made (octo.db.v5 «day»); the next day a fresh seed
 * replaced it silently. Now it is read any day; only «Сбросить тестовые данные» starts it over.
 * The record is put from a page without the app (h.seed) as an earlier day left it, with an estimate of the person's own.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const base = raw.db.estimates[0];
  raw.db.estimates.push({ ...base, id: "e-282", title: "Nightly 282 kept estimate", number: "EST-0282" });
  raw.day = "2020-01-01"; // an earlier day, never today in Los Angeles
  await h.seed("octo.db.v5", raw);

  await h.go("/estimate/e-282");
  await p.getByTestId("estimate-screen").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await p.getByTestId("no-access").count()) === 0, "the estimate made an earlier day opens");
  const kept = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")).db.estimates.some((e) => e.id === "e-282"));
  h.expect(kept, "the stored demo still holds it (not a fresh seed)");
  await h.shot("kept");
};
