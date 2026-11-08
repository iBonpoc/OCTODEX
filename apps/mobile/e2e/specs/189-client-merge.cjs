/**
 * Step 17 C3 (docs/specs/04 §13, map S3d): duplicate clients and the merge, in the demo (the server side is db T134).
 * - a second card with Sarah Mitchell's phone written another way → «Возможный дубль» on both cards in the list;
 * - Sarah's card: the compact card «Возможный дубль: Sarah M.» → the sheet (the older card stays) → «Слить» → the
 *   confirmation → «Да, слить» → the twin's property is Sarah's, the twin is archived + merged, out of the list;
 * - «Отменить» brings both back as they were (nothing is sent: the op waits the toast out);
 * - the old link of the merged card says where everything went;
 * - «Не дубль» hides the pair for good.
 */
const TWIN = "c-e2e-189";
const TWIN2 = "c-e2e-189b";

exports.run = async (h) => {
  const p = h.page;
  // the store writes the phone's copy a moment after the change: wait for what is checked, not for seconds
  const dbWhen = async (ok) => {
    let db = await h.db();
    for (let i = 0; i < 40 && !ok(db); i++) { await p.waitForTimeout(150); db = await h.db(); }
    return db;
  };
  await h.go("/clients");
  await p.evaluate((twin) => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers.push({ id: twin, number: "CLT-0189", name: "Sarah M.", phone: "+1 626 555 0142", sourceId: "src-yelp", balanceCents: 0 });
    s.db.properties.push({ id: "p-e2e-189", customerId: twin, address: "77 Twin Ln", city: "Pasadena, CA 91101", stories: 1 });
    localStorage.setItem(k, JSON.stringify(s));
  }, TWIN);
  await h.go("/clients");
  const twinCard = p.getByTestId("list-card").filter({ hasText: "Sarah M." }).locator("visible=true").first();
  await twinCard.waitFor({ timeout: 5000 });
  h.expect(/Возможный дубль/.test(await twinCard.innerText()), "the list: the twin is marked «Возможный дубль»");
  const sarahCard = p.getByTestId("list-card").filter({ hasText: "Sarah Mitchell" }).locator("visible=true").first();
  h.expect(/Возможный дубль/.test(await sarahCard.innerText()), "the list: Sarah is marked too");
  await h.shot("list");

  // the card: the duplicate → the sheet → «Слить» → confirm
  await h.go("/client/c1");
  const dup = p.getByTestId(`client-dup-${TWIN}`).locator("visible=true").first();
  await dup.waitFor({ timeout: 5000 });
  h.expect(/тот же телефон/.test(await dup.innerText()), "the card says why: the same phone");
  await dup.click();
  const sheet = h.sheet();
  await sheet.getByRole("button", { name: "Слить", exact: true }).waitFor({ timeout: 5000 });
  h.expect(/В «Sarah Mitchell» перейдут: людей 1, объектов 1$/m.test(await sheet.innerText()), "the sheet: the older card stays, what moves");
  await h.shot("sheet");
  await sheet.getByRole("button", { name: "Слить", exact: true }).click();
  await sheet.getByRole("button", { name: "Да, слить" }).waitFor({ timeout: 5000 });
  h.expect(/нельзя будет вернуть из приложения/.test(await sheet.innerText()), "the confirmation says it is final after the undo");
  await sheet.getByRole("button", { name: "Да, слить" }).click();
  await h.expectText(/Слито в «Sarah Mitchell»/, "the toast");
  let db = await dbWhen((d) => d.customers.find((c) => c.id === TWIN)?.mergedIntoId);
  let twin = db.customers.find((c) => c.id === TWIN);
  h.expect(twin.mergedIntoId === "c1" && twin.status === "archived", "the twin is archived and merged into Sarah");
  h.expect(db.properties.find((x) => x.id === "p-e2e-189").customerId === "c1", "the twin's property is Sarah's");
  h.expect(/\/client\/c1/.test(p.url()), `Sarah's card stays open (${p.url()})`);
  h.expect((await p.getByTestId(`client-dup-${TWIN}`).count()) === 0, "no duplicate on the card any more");

  // «Отменить»: both as they were
  await p.getByRole("button", { name: "Отменить" }).last().click();
  await p.getByTestId(`client-dup-${TWIN}`).locator("visible=true").first().waitFor({ timeout: 5000 });
  db = await dbWhen((d) => !d.customers.find((c) => c.id === TWIN)?.mergedIntoId);
  twin = db.customers.find((c) => c.id === TWIN);
  h.expect(!twin.mergedIntoId && twin.status !== "archived", "undo: the twin is a client again");
  h.expect(db.properties.find((x) => x.id === "p-e2e-189").customerId === TWIN, "undo: its property is its own again");

  // merge for good; the list and the old link
  await p.getByTestId(`client-dup-${TWIN}`).locator("visible=true").first().click();
  await h.sheet().getByRole("button", { name: "Слить", exact: true }).click();
  await h.sheet().getByRole("button", { name: "Да, слить" }).click();
  await h.expectText(/Слито в «Sarah Mitchell»/, "merged again");
  await dbWhen((d) => d.customers.find((c) => c.id === TWIN)?.mergedIntoId);
  await h.go("/clients");
  await p.getByTestId("list-card").filter({ hasText: "Sarah Mitchell" }).locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("list-card").filter({ hasText: "Sarah M." }).filter({ hasNotText: "Mitchell" }).count()) === 0, "the merged card is not in the list");
  h.expect(!/Возможный дубль/.test(await p.getByTestId("list-card").filter({ hasText: "Sarah Mitchell" }).locator("visible=true").first().innerText()), "Sarah has no mark now");
  await h.go(`/client/${TWIN}`);
  await h.expectText(/Карточка слита/, "the old link: the card was merged");
  await h.expectText(/Всё перешло в «Sarah Mitchell»/, "…and where everything went");
  await p.getByRole("button", { name: "Открыть «Sarah Mitchell»" }).locator("visible=true").first().click();
  await p.waitForURL(/\/client\/c1/, { timeout: 5000 });
  await h.shot("merged");

  // «Не дубль»: another card with Sarah's email — the pair is hidden for good
  await p.evaluate((twin2) => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers.push({ id: twin2, number: "CLT-0190", name: "S. Mitchell (tenant)", phone: "(213) 555-0190", email: "SARAH.M@example.com", sourceId: "src-yelp", balanceCents: 0 });
    localStorage.setItem(k, JSON.stringify(s));
  }, TWIN2);
  await h.go("/client/c1");
  const dup2 = p.getByTestId(`client-dup-${TWIN2}`).locator("visible=true").first();
  await dup2.waitFor({ timeout: 5000 });
  h.expect(/та же почта/.test(await dup2.innerText()), "the same email");
  await dup2.click();
  await h.sheet().getByRole("button", { name: "Не дубль" }).click();
  await h.expectText(/Не дубль: S\. Mitchell/, "the toast");
  h.expect((await p.getByTestId(`client-dup-${TWIN2}`).count()) === 0, "the pair is not shown");
  db = await dbWhen((d) => (d.customers.find((c) => c.id === "c1").notDuplicateIds || []).length > 0);
  h.expect((db.customers.find((c) => c.id === "c1").notDuplicateIds || []).includes(TWIN2), "kept on Sarah's card");
};
