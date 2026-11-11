/**
 * e2e 261 — a technician opens another tech's work by a direct address (#868, Q-40/Q-41; 13 §4 «Мастер — только своё»).
 * The audit found that in the demo the tech opened another tech's /visit, /job, /invoice, /estimate with their amounts,
 * saw every job and estimate in the lists, and changed or deleted a price list item by /catalog/<id>.
 * Now another tech's record shows «нет доступа» (as the server answers in the cloud — RLS, T22/T33/T35), his own
 * opens as before; the lists show only his own; a price list item does not open for him. The office still sees all.
 * The demo seed: me = m-alex; v1 (j1), v2 (j2) are mine; v4 (j5) is m-ivan's, i4 is j5's invoice, e1/e3 are not mine.
 */
const noAccess = (h) => h.page.getByTestId("no-access").first();

/** `open` — what the record itself shows when it opens (its title); null — it must answer «no access» */
async function shows(h, path, open, what) {
  await h.go(path);
  if (!open) {
    await noAccess(h).waitFor({ state: "visible", timeout: 15000 });
    h.expect(await noAccess(h).isVisible(), `${what}: no access`);
  } else {
    await h.page.getByText(open).first().waitFor({ state: "visible", timeout: 15000 });
    h.expect((await h.page.getByTestId("no-access").count()) === 0, `${what}: opens`);
  }
}

exports.run = async (h) => {
  await h.seed("octo.role.v1", "tech");
  await shows(h, "/visit/v4", null, "the tech: another tech's visit");
  await shows(h, "/job/j5", null, "the tech: another tech's job");
  await shows(h, "/invoice/i4", null, "the tech: the invoice of another tech's job");
  await shows(h, "/estimate/e1", null, "the tech: an estimate of nothing of his");
  await shows(h, "/catalog/cat-haul", null, "the tech: a price list item (no price, no save, no delete)");
  await h.shot("tech-no-access");
  await shows(h, "/visit/v1", /Bathroom remodel/, "the tech: his own visit");
  await shows(h, "/job/j1", /Bathroom remodel/, "the tech: his own job");
  await shows(h, "/invoice/i5", /Счёт/, "the tech: the invoice of his own job");

  // #1113 (П-23/П-44): the tech's own draft (e6 made a draft here, from a page without the app) — the send sheet by its
  // address (?send=1) does not open for him, «the office sends it» instead of the button; the builder saves only
  const raw = await h.page.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  Object.assign(raw.db.estimates.find((x) => x.id === "e6"), { status: "draft", token: undefined, sentAt: undefined });
  await h.seed("octo.db.v5", raw);
  await h.go("/estimate/e6?send=1");
  await h.page.getByTestId("est-send-office").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await h.page.getByTestId("send-buttons").count()) === 0, "the tech: ?send=1 opens no send sheet");
  h.expect((await h.page.getByTestId("est-send").count()) === 0, "the tech: no «Отправить» button");
  await h.go("/estimate/new?id=e6");
  await h.page.getByTestId("ue-save").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await h.page.getByTestId("ue-save-send").count()) === 0, "the tech: the builder has no «Сохранить и отправить»");

  // the lists: only his own
  await h.go("/jobs");
  await h.page.getByText(/Bathroom remodel/).first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await h.page.getByText(/Deep clean after move-out/).count()) === 0, "the tech: /jobs has no job of another tech (j5)");
  await h.go("/estimates");
  await h.page.getByText(/Bathroom remodel|Kitchen backsplash/).first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await h.page.getByText(/Panel upgrade 200A/).count()) === 0, "the tech: /estimates has no estimate of nothing of his (e1)");

  // the office sees everything as before
  await h.seed("octo.role.v1", "director");
  await shows(h, "/visit/v4", /Deep clean after move-out/, "the director: any visit");
  await shows(h, "/invoice/i4", /Счёт/, "the director: any invoice");
  await h.go("/catalog/cat-haul");
  await h.page.getByTestId("catalog-name").first().waitFor({ state: "visible", timeout: 15000 });
  h.expect((await h.page.getByTestId("no-access").count()) === 0, "the director: a price list item opens");
};
