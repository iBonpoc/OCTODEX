/**
 * e2e 261 — a technician opens another tech's work by a direct address (#868, Q-40/Q-41; 13 §4 «Мастер — только своё»).
 * The audit found that in the demo the tech opened another tech's /visit, /job, /invoice, /estimate with their amounts,
 * saw every job and estimate in the lists, and changed or deleted a price list item by /catalog/<id>.
 * Now another tech's record shows «нет доступа» (as the server answers in the cloud — RLS, T22/T33/T35), his own
 * opens as before; the lists show only his own; a price list item does not open for him. The office still sees all.
 * The demo seed: me = m-alex; v1 (j1), v2 (j2) are mine; v4 (j5) is m-ivan's, i4 is j5's invoice, e1/e3 are not mine;
 * the inspection v6 at p7 (e2's property) is made his here.
 */
const noAccess = (h) => h.page.getByTestId("no-access").first();

/** `open` — the testID of the record's own screen when it opens; null — it must answer «no access» */
async function shows(h, path, open, what) {
  await h.go(path);
  if (!open) {
    await noAccess(h).waitFor({ state: "visible", timeout: 15000 });
    h.expect(await noAccess(h).isVisible(), `${what}: no access`);
  } else {
    await h.page.getByTestId(open).first().waitFor({ state: "visible", timeout: 15000 });
    h.expect((await h.page.getByTestId("no-access").count()) === 0, `${what}: opens`);
  }
}

/** the list has drawn its cards and holds `mine` (its title) — then what is not in it is checked */
async function listHolds(h, mine) {
  await h.page.getByTestId("list-card").filter({ hasText: mine }).first().waitFor({ state: "visible", timeout: 15000 });
}

exports.run = async (h) => {
  const p = h.page;
  // Б1 (director's review): the inspection v6 at p7 (no job) is the tech's; e2 is an estimate on p7 — the server shows it
  // him (estimates_select: his visit at the property), whoever the lead is assigned to. Set from a page without the app.
  await h.go("/today");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  Object.assign(raw.db.visits.find((x) => x.id === "v6"), { techId: raw.db.me, assigneeIds: [raw.db.me] });
  // #1113: the tech's own draft (e6) — the send sheet by its address does not open for him
  Object.assign(raw.db.estimates.find((x) => x.id === "e6"), { status: "draft", token: undefined, sentAt: undefined });
  await h.seed("octo.db.v5", raw);
  await h.seed("octo.role.v1", "tech");

  await shows(h, "/visit/v4", null, "the tech: another tech's visit");
  await shows(h, "/job/j5", null, "the tech: another tech's job");
  await shows(h, "/invoice/i4", null, "the tech: the invoice of another tech's job");
  await shows(h, "/estimate/e1", null, "the tech: an estimate of nothing of his");
  // Б2: the builder of someone else's estimate by its address — no lines, no save
  await shows(h, "/estimate/new?id=e1", null, "the tech: the builder of an estimate of nothing of his");
  await shows(h, "/catalog/cat-haul", null, "the tech: a price list item (no price, no save, no delete)");
  await h.shot("tech-no-access");
  await shows(h, "/visit/v1", "visit-screen", "the tech: his own visit");
  await shows(h, "/job/j1", "job-screen", "the tech: his own job");
  await shows(h, "/invoice/i5", "invoice-screen", "the tech: the invoice of his own job");
  await shows(h, "/estimate/e2", "estimate-screen", "the tech: the estimate at the property of his inspection (Б1)");

  // #1113 (П-23/П-44): ?send=1 opens no send sheet for him, «the office sends it» instead of the button; the builder saves only
  await h.go("/estimate/e6?send=1");
  await p.getByTestId("est-send-office").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await p.getByTestId("send-buttons").count()) === 0, "the tech: ?send=1 opens no send sheet");
  h.expect((await p.getByTestId("est-send").count()) === 0, "the tech: no «Отправить» button");
  await h.go("/estimate/new?id=e6");
  await p.getByTestId("ue-save").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await p.getByTestId("ue-save-send").count()) === 0, "the tech: the builder has no «Сохранить и отправить»");

  // the lists: only his own — counted once the list has drawn his own card
  await h.go("/jobs");
  await listHolds(h, /Bathroom remodel/);
  h.expect((await p.getByTestId("list-card").filter({ hasText: /Deep clean after move-out/ }).count()) === 0, "the tech: /jobs has no job of another tech (j5)");
  await h.go("/estimates");
  await listHolds(h, /Fence repair/);
  h.expect((await p.getByTestId("list-card").filter({ hasText: /Panel upgrade 200A/ }).count()) === 0, "the tech: /estimates has no estimate of nothing of his (e1)");
  if (h.layout.width === 1280) {
    // Б3: the panel beside the list by its address — his own opens, another's does not
    await h.go("/estimates?open=e2");
    await p.getByTestId("list-panel").first().waitFor({ state: "visible", timeout: 15000 });
    await h.go("/estimates?open=e1");
    await listHolds(h, /Fence repair/);
    h.expect((await p.getByTestId("list-panel").count()) === 0, "the tech, 1280: ?open= of an estimate of nothing of his opens no panel");
  }

  // the office sees everything as before
  await h.seed("octo.role.v1", "director");
  await shows(h, "/visit/v4", "visit-screen", "the director: any visit");
  await shows(h, "/invoice/i4", "invoice-screen", "the director: any invoice");
  await shows(h, "/estimate/new?id=e1", "ue-save", "the director: the builder of any estimate");
  await h.go("/catalog/cat-haul");
  await p.getByTestId("catalog-name").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await p.getByTestId("no-access").count()) === 0, "the director: a price list item opens");
};
