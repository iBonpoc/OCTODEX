/**
 * e2e 131: «Осмотр прошёл — сметы нет» in «Требует внимания» (S15; docs/specs/03 §5.2, §13), every view.
 * The spec plants a lead «booked» whose inspection was done three days ago (always at least one working day behind us —
 * two days in a row are never both closed by default) and no estimate.
 * - director: the card «<лид>: осмотр прошёл — сметы нет» → opens the lead; one card for the lead;
 * - «Компания → Лиды»: the threshold «Рабочих дней» 1 → 4 → the card is gone (back to 1 → it is back; «Отменить» works);
 * - an estimate of the lead (a draft) closes it;
 * - a tech does not see it.
 */
const LEAD = "E2E Inspected Lead";
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  await p.evaluate((LEAD) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const base = raw.db.leads[0];
    const ago = new Date(Date.now() - 3 * 86400000);
    ago.setUTCMinutes(0, 0, 0);
    const at = ago.toISOString();
    raw.db.leads = [{ ...base, id: "e2e-insp", name: LEAD, status: "booked", receivedAt: at, firstResponseAt: at, lastInboundAt: undefined,
      lastOutboundAt: at, lastActivityAt: at, snoozedUntil: undefined, archivedAt: undefined }, ...raw.db.leads.filter((l) => l.id !== "e2e-insp")];
    raw.db.visits = [{ id: "e2e-insp-v", leadId: "e2e-insp", propertyId: base.propertyId, kind: "inspection", techId: raw.db.me, assigneeIds: [raw.db.me],
      start: at, durationMin: 45, step: "done", scope: [], checklist: [], photos: [], amountDueCents: 0 }, ...raw.db.visits.filter((v) => v.id !== "e2e-insp-v")];
    raw.db.estimates = raw.db.estimates.filter((e) => e.leadId !== "e2e-insp");
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, LEAD);
  const card = () => p.getByText(`${LEAD}: осмотр прошёл — сметы нет`).locator("visible=true");

  await h.go("/triage");
  await h.expectText(new RegExp(`${LEAD}: осмотр прошёл — сметы нет`), "the passed inspection without an estimate is a card");
  h.expect((await p.getByText(new RegExp(`^${LEAD}:`)).locator("visible=true").count()) === 1, `one card for the lead (${await p.getByText(new RegExp(`^${LEAD}:`)).locator("visible=true").allInnerTexts()})`);
  await card().first().click(); await p.waitForTimeout(700);
  h.expect(path(h) === "/lead/e2e-insp", `the card opens the lead (${p.url()})`);

  // the threshold on «Компания → Лиды»: 4 working days → not yet
  await h.go("/company/leads");
  await h.expectText(/Осмотр прошёл — сметы нет/, "the setting card");
  const plus = p.getByRole("button", { name: "Рабочих дней +1" });
  for (let i = 0; i < 3; i++) { await plus.click(); await p.waitForTimeout(250); }
  let db = await h.db();
  h.expect(db.company.leadSettings?.inspectionNoEstimateDays === 4, `saved at once: ${JSON.stringify(db.company.leadSettings)}`);
  await h.go("/triage");
  h.expect((await card().count()) === 0, "4 working days: not yet");
  await h.go("/company/leads");
  const minus = p.getByRole("button", { name: "Рабочих дней −1" });
  for (let i = 0; i < 3; i++) { await minus.click(); await p.waitForTimeout(250); }
  db = await h.db();
  h.expect(db.company.leadSettings?.inspectionNoEstimateDays === 1, "back to 1");
  await h.go("/triage");
  h.expect((await card().count()) === 1, "1 working day: the card is back");

  // a tech does not see it
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/today");
  h.expect((await p.getByText(new RegExp(`${LEAD}: осмотр прошёл`)).locator("visible=true").count()) === 0, "a tech: no card");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));

  // a draft estimate of the lead closes it
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const e = raw.db.estimates[0];
    raw.db.estimates = [{ ...e, id: "e2e-insp-e", leadId: "e2e-insp", status: "draft", sentAt: undefined, approvedAt: undefined }, ...raw.db.estimates];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/triage");
  h.expect((await card().count()) === 0, "an estimate of the lead (a draft) closes it");
};
