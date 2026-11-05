/**
 * T2 (docs/specs/11-trade.md §1, handoff S16): «Направление» on the estimate screen.
 * The office changes it until the client signs; the change stays on the estimate (the lead is not touched);
 * after a signature it is read-only (the job keeps its own); a tech changes it only in a draft.
 */
const KEY = "octo.db.v5";

async function patchEstimate(h, id, patch) {
  await h.page.evaluate(
    ({ KEY, id, patch }) => {
      const raw = JSON.parse(localStorage.getItem(KEY));
      raw.db.estimates = raw.db.estimates.map((e) => (e.id === id ? { ...e, ...patch } : e));
      localStorage.setItem(KEY, JSON.stringify(raw));
    },
    { KEY, id, patch },
  );
}

const dirButton = (h) => h.page.getByRole("button", { name: "Направление" });

exports.run = async (h) => {
  const p = h.page;

  // director, a sent estimate (demo e6, from lead l5): choose a direction
  await h.go("/estimate/e6");
  await h.expectText(/Направление/, "direction row on the estimate");
  let db = await h.db();
  const leadBefore = db.leads.find((l) => l.id === "l5")?.serviceCategoryId;
  await dirButton(h).first().click();
  await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Электрика" }).click();
  await p.waitForTimeout(400);
  await h.expectText(/Направление изменено/, "toast after the change");
  await h.expectText(/Электрика/, "the chosen direction is shown");
  db = await h.db();
  h.expect(db.estimates.find((e) => e.id === "e6")?.serviceCategoryId === "cat-electrical", "saved on the estimate");
  h.expect(db.leads.find((l) => l.id === "l5")?.serviceCategoryId === leadBefore, "the change does not go back to the lead");

  // back to «no direction»
  await dirButton(h).first().click();
  await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Без направления" }).click();
  await p.waitForTimeout(400);
  db = await h.db();
  h.expect(!db.estimates.find((e) => e.id === "e6")?.serviceCategoryId, "direction cleared");

  // signed by both (demo e5): shown, not changeable
  await patchEstimate(h, "e5", { serviceCategoryId: "cat-plumbing" });
  await h.go("/estimate/e5");
  await h.expectText(/Сантехника/, "a signed estimate shows its direction");
  h.expect((await dirButton(h).count()) === 0, "a signed estimate: the direction is read-only");

  // client signed, waiting for the company: read-only too
  await patchEstimate(h, "e6", { status: "awaiting_countersign" });
  await h.go("/estimate/e6");
  await h.expectText(/Направление/, "row shown while waiting for the company");
  h.expect((await dirButton(h).count()) === 0, "client signed: the direction is read-only");

  // a tech: not in a sent estimate, yes in a draft
  await patchEstimate(h, "e6", { status: "sent" });
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/estimate/e6");
  h.expect((await dirButton(h).count()) === 0, "tech: a sent estimate keeps its direction");
  await patchEstimate(h, "e6", { status: "draft" });
  await h.go("/estimate/e6");
  await dirButton(h).first().click();
  await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Покраска" }).click();
  await p.waitForTimeout(400);
  db = await h.db();
  h.expect(db.estimates.find((e) => e.id === "e6")?.serviceCategoryId === "cat-painting", "tech changes the direction of a draft");
};
