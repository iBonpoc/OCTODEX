const { dayKey, todayKey } = require("../companyTime.cjs");
/**
 * Technician's «Visits» on the new list cards (step 10а, unslop 05.11), every view (3 widths × 2 themes).
 * - one grid for «Now / Next», «Today», «Later»: cards of a row share top and height, no full-width block or button;
 * - a visit card: time block, client, «from – to», address, work, status in words; «Открыть выезд» is inside the focus card;
 * - one accent on the screen; no «…».
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");
const { expectOneAccent } = require("../accent.cjs");

exports.init = { role: "tech" };
exports.run = async (h) => {
  const p = h.page;
  await h.go("/visits");
  const db = await h.db();
  const mine = db.visits.filter((v) => v.techId === db.me && dayKey(v.start) === todayKey()); // the company's today (П4b)
  h.expect(mine.length > 0, "tech has visits today");
  const cards = p.locator('[data-testid="list-card"]');
  h.expect((await cards.count()) >= mine.length, `every visit is a list card (${await cards.count()} ≥ ${mine.length})`);

  // a visit card shows the client, the address and the work
  const v = mine.find((x) => x.step !== "paid") ?? mine[0];
  const job = db.jobs.find((j) => j.id === v.jobId);
  const prop = db.properties.find((x) => x.id === job.propertyId);
  const cust = db.customers.find((c) => c.id === prop.customerId);
  const txt = await cards.filter({ hasText: cust.name }).first().innerText();
  for (const s of [cust.name, prop.address, job.title]) h.expect(txt.includes(s), `visit card shows «${s}»: ${txt.slice(0, 200)}`);
  h.expect(/\d{1,2}:\d\d (AM|PM) – \d{1,2}:\d\d (AM|PM)/.test(txt), "from – to");
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…»");

  // «Open visit» is inside a card, not a full-width button
  const open = p.getByRole("button", { name: "Открыть выезд" }).first();
  const ob = await open.boundingBox();
  const fb = await cards.first().boundingBox();
  h.expect(ob && fb && ob.width < fb.width / 2, `«Открыть выезд» is a button inside the card (${ob && ob.width} < ${fb && fb.width / 2})`);
  await expectOneAccent(h, "Visits (tech)");
  await p.evaluate(() => window.scrollTo(0, 0));
  await checkCardAlignment(h, { reference: (pg) => pg.getByText("Мой день").first(), min: 1 });
  await h.shot("visits");

  await open.click();
  await p.waitForTimeout(500);
  h.expect(/\/visit\//.test(p.url()), `opens the visit (${p.url()})`);
};
