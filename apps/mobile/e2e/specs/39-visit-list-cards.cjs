const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * Technician's «Мой день» (v2 #2350, the Overview template; was «Visits» on the list cards of step 10а), every view.
 * - every visit of his today is said once: the next one is the card «Дальше» (`visits-next`), the rest of the day are rows
 *   (`visits-row`, GroupRow) — no visit twice (П7), none lost;
 * - the card «Дальше»: the hour, the client, «работа · адрес», the trio «на месте · чек-лист · что сделать», the ONE main step;
 * - a row opens its visit; one accent on the screen; no «…».
 */
const { expectOneAccent } = require("../accent.cjs");

exports.init = { role: "tech" };
exports.run = async (h) => {
  const p = h.page;
  await h.go("/visits");
  const db = await h.db();
  const mine = db.visits.filter((v) => (v.assigneeIds?.length ? v.assigneeIds : [v.techId]).includes(db.me) && dayKey(v.start) === todayKey()); // the company's today (П4b)
  h.expect(mine.length > 0, "tech has visits today");
  const next = p.getByTestId("visits-next").locator("visible=true").first();
  const rows = p.getByTestId("visits-row").locator("visible=true");
  await rows.first().waitFor({ timeout: 8000 });
  const focus = (await next.count()) && (await p.getByTestId("home-main-en-route").or(p.getByTestId("home-main-continue")).locator("visible=true").count()) ? 1 : 0;
  h.expect((await rows.count()) + focus === mine.length, `every visit once: the card «Дальше» (${focus}) and the rows (${await rows.count()}) = ${mine.length}`);

  // the card «Дальше»: the hour, the client, the work and the address, the trio, the main step
  if (focus) {
    const now = Date.now();
    const v = mine.filter((x) => x.step !== "scheduled" && !x.closed && !["paid", "done"].includes(x.step))[0]
      ?? mine.filter((x) => x.step === "scheduled" && Date.parse(x.start) + x.durationMin * 60_000 > now).sort((a, b) => a.start.localeCompare(b.start))[0];
    h.expect(!!v, "the card «Дальше» is a visit of today");
    const job = db.jobs.find((j) => j.id === v.jobId);
    const prop = db.properties.find((x) => x.id === (job?.propertyId ?? v.propertyId));
    const cust = db.customers.find((c) => c.id === prop.customerId);
    const txt = (await next.innerText()).replace(/\s+/g, " ");
    for (const s of [cust.name, prop.address, ...(job ? [job.title] : [])]) h.expect(txt.includes(s), `the card «Дальше» shows «${s}»: ${txt.slice(0, 240)}`);
    h.expect(/\d{1,2}:\d\d\s?(AM|PM)/.test(txt), `the hour: ${txt.slice(0, 120)}`);
    h.expect((await p.getByTestId("visits-next-trio").locator("visible=true").count()) === 1, "the trio of figures");
  }
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…»");
  await expectOneAccent(h, "Visits (tech)");
  await h.shot("visits");

  // a row opens its visit
  await rows.first().click();
  await p.waitForURL(/\/visit\//, { timeout: 5000 });
  h.expect(/\/visit\//.test(p.url()), `opens the visit (${p.url()})`);
};
