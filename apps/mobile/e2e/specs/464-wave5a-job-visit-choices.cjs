/**
 * e2e 464 — spec 56 wave 5а (#1869): the job and the visit choose by rows, not chips or segments. Every view, by testID and the store.
 * - the job's history: the filter is the list's lane (FilterBar), the tabs stay segments;
 * - «Новая работа»: the address is a row that opens the list with search, the type a row with a menu, «Назначить дату» a row with
 *   a switch and the visit's fields under it; «Весь день» a switch; the people — rows with a check;
 * - a note «Только мне» (a row with a menu, default «Для команды»): written as `private`, not seen by another person (privacy);
 * - the visit's payment by «Zelle» from the method's menu: the same code and the same amount go into the payment as before.
 * Seeded from a page without the app (h.seed, CHECKS §9 №12).
 */
const NOTE = "Код калитки 4471 — только мне";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const old = (root) => root.locator('[role="tab"], [role="tablist"], [role="checkbox"]').locator("visible=true").count();

  // — the job's history: the filter lane
  await h.go("/job/j1");
  // v2: the job is the Object template — «Заметки» is a section of its strip
  await p.getByTestId("job-screen-sections-notes").locator("visible=true").first().click();
  await tid("job-history-filter").waitFor({ timeout: 8000 });
  h.expect((await old(tid("job-history-filter"))) === 0, "the history filter is no segments");
  await tid("job-history-filter").getByRole("radio", { name: "Заметки", exact: true }).click();
  h.expect((await tid("job-history-filter").getByRole("radio", { name: "Заметки", exact: true }).getAttribute("aria-checked")) === "true", "«Заметки» is on in the lane");

  // — a note «Только мне» on a lead (its «Переписка» has the notes)
  await h.go("/lead/l1");
  await h.clickText("Переписка");
  await p.getByPlaceholder("Собака во дворе, где парковаться…").locator("visible=true").fill(NOTE);
  h.expect(/Для команды/.test((await tid("note-visibility-button").getAttribute("aria-label")) || ""), "«Видно: Для команды» by default (the eye inside the composer)");
  await tid("note-visibility-button").click();
  await tid("note-visibility-private").click();
  await h.click("Добавить заметку");
  await p.waitForFunction((b) => ((JSON.parse(localStorage.getItem("octo.db.v5") || "null") || {}).db?.notes || []).some((n) => n.body === b), NOTE, { timeout: 8000 });
  let db = await h.db();
  const note = db.notes.find((n) => n.body === NOTE);
  h.expect(note.visibility === "private" && note.authorId === db.me, `written as «private» by me (${note.visibility})`);
  // another person of the team opens the same lead: the note is not there
  const other = db.members.find((m) => m.id !== db.me && !m.pending && m.roles.includes("tech"));
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const me = raw.db.me;
  raw.db.me = other.id;
  await h.seed("octo.db.v5", raw);
  await h.go("/lead/l1");
  await h.clickText("Переписка");
  await tid("note-visibility-button").waitFor({ timeout: 8000 });
  h.expect((await p.getByText(NOTE).locator("visible=true").count()) === 0, `${other.name} does not see my «Только мне» note`);
  raw.db.me = me;
  await h.seed("octo.db.v5", raw);

  // — «Новая работа» for a client with a property
  await h.go("/job/new?customerId=c1");
  await tid("job-new-title").waitFor({ timeout: 8000 });
  h.expect((await p.locator('[role="radio"], [role="tab"], [role="checkbox"]').locator("visible=true").count()) === 0, "«Новая работа»: no chips, segments or checkboxes");
  await tid("job-new-address-button").click();
  await tid("job-new-address-picker").waitFor({ timeout: 4000 });
  h.expect((await p.getByTestId("job-new-address-picker-search").locator("visible=true").count()) === 1, "the address opens the list with search");
  await tid("job-new-address-picker-__new").click();
  await tid("job-new-address-picker").waitFor({ state: "detached", timeout: 4000 });
  await p.getByPlaceholder("Pasadena, CA 91103").locator("visible=true").first().waitFor({ timeout: 4000 });
  h.expect(true, "«Новый адрес» from the list opens the address fields");
  h.expect(/Тип/.test(await tid("job-new-type-button").innerText()), "«Тип ⌄» is a row");
  // «Назначить дату»: off — no visit fields; on — they are under it
  const tech = db.members.find((m) => m.id === "m-ivan");
  h.expect((await p.getByTestId(`vf-tech-${tech.id}`).locator("visible=true").count()) === 0, "«Назначить дату» off: no visit fields");
  await p.getByRole("switch", { name: "Назначить дату" }).locator("visible=true").first().click();
  await tid(`vf-tech-${tech.id}`).waitFor({ timeout: 4000 });
  h.expect(true, "«Назначить дату» on: the visit's fields are under it");
  // — the visit form of a job: «Весь день» a switch, the people rows with a check
  await h.go("/job/schedule?jobId=j1");
  await tid("vf-all-day").waitFor({ timeout: 8000 });
  await tid("vf-all-day").click();
  h.expect((await p.getByRole("switch", { name: "Весь день" }).locator("visible=true").first().getAttribute("aria-checked")) === "true", "«Весь день» is a switch, on");
  const was = await tid(`vf-tech-${tech.id}`).getAttribute("aria-selected");
  await tid(`vf-tech-${tech.id}`).click();
  h.expect((await tid(`vf-tech-${tech.id}`).getAttribute("aria-selected")) !== was, `${tech.name}: a tap checks or unchecks the row`);
  h.expect((await p.locator("text=/^✓ /").locator("visible=true").count()) === 0, "no «✓ » in the rows' text");
  await h.shot("new-job");

  // — the visit's payment: «Zelle» from the menu, the same code and amount
  await h.go("/today");
  const raw2 = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const d2 = raw2.db;
  const visit = d2.visits.find((v) => v.jobId && v.techId === d2.me);
  const job = d2.jobs.find((j) => j.id === visit.jobId);
  job.amountCents = 42000;
  d2.invoices = d2.invoices.filter((i) => i.jobId !== job.id);
  d2.payments = d2.payments.filter((x) => d2.invoices.some((i) => i.id === x.invoiceId));
  visit.step = "signed";
  visit.checklist = (visit.checklist ?? []).map((c) => ({ ...c, done: true }));
  await h.seed("octo.db.v5", raw2);
  await h.go(`/visit/${visit.id}`);
  await tid("visit-amount-due").waitFor({ timeout: 15000 });
  h.expect((await old(tid("visit-method"))) === 0 && (await tid("visit-method").locator('[role="radio"]').count()) === 0, "the method is no segments");
  await tid("visit-method-button").click();
  await tid("visit-method-zelle").click();
  h.expect(/Zelle/.test(await tid("visit-method-button").innerText()), "«Способ оплаты · Zelle»");
  await tid("visit-record-payment").click();
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits?.find((x) => x.id === id)?.step === "paid", visit.id, { timeout: 8000 });
  const after = await h.db();
  const inv = after.invoices.filter((i) => i.jobId === job.id);
  const pays = after.payments.filter((x) => inv.some((i) => i.id === x.invoiceId));
  h.expect(pays.length === 1 && pays[0].method === "zelle" && pays[0].amountCents === 42000, `one payment «zelle» of $420: ${JSON.stringify(pays.map((x) => [x.method, x.amountCents]))}`);
  await h.shot("visit-paid");
};
