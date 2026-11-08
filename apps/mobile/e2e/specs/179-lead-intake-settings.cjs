/**
 * Step 16, PR 3 (docs/specs/34-lead-intake.md §3в, story map S1): «Компания → Лиды → Приём заявок» in the demo, and a
 * repeat request in a lead's feed.
 * - «Компания → Лиды» has the card «Приём заявок с сайта и Zapier» → /company/intake;
 * - in the demo (no cloud account) the screen says the intake works in a cloud account — no fake link, no fake key
 *   (the server makes them; the cloud side is db T112–T120 and unit leadIntakeFn / intakeSettings);
 * - a repeat request of the same person (activity kind «intake», written by the server) is a line of the lead's feed,
 *   marked unconfirmed, with the person's words.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/company/leads");
  await p.getByTestId("intake-entry").locator("visible=true").first().waitFor({ timeout: 5000 });
  await p.getByTestId("intake-entry").locator("visible=true").first().click();
  await p.waitForTimeout(600);
  h.expect(new URL(p.url()).pathname === "/company/intake", `the card opens the intake screen (${p.url()})`);
  await p.getByTestId("intake-cloud-only").locator("visible=true").first().waitFor({ timeout: 5000 });
  await h.expectText(/Приём заявок работает в облачном аккаунте/, "the demo says where it works");
  const text = await h.text();
  h.expect(!/\/f\/f[0-9a-f]{32}|gxk_/.test(text), "no fake link or key in the demo");
  await h.shot("cloud-only");

  // a repeat request of the same person, as the server writes it (activities.kind = intake, direction in)
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.activities.push({ id: "act-intake-179", subjectType: "lead", subjectId: "l1", kind: "intake", direction: "in",
      body: "Second request: also the downspouts", at: new Date().toISOString(), actorId: "", meta: { unconfirmed: "1" } });
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/lead/l1");
  await h.expectText(/Повторная заявка \(не подтверждено\)/, "the feed line says it is a repeat, unconfirmed");
  await h.clickText("Переписка");
  await h.expectText(/Second request: also the downspouts/, "the feed («Переписка») has the person's words");
  await h.shot("lead-feed");
};
