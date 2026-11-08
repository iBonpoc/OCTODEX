/**
 * Step 17 C3 — «Импорты» (docs/specs/04 §14.4, PR 3), in the demo: Клиенты → «…» → «Импорт из CSV» → a file of three
 * clients → «Импортировать» → «К клиентам» → «…» → «Импорты»: a card with the file, the counts and «Загружен» →
 * «Отменить импорт» → the confirmation says what stays → «Да, отменить импорт» → the toast says how many were taken
 * back, the card says «Отменён», the clients are gone. The server side of the undo (what stays) is db T138.
 */
const CSV = ["Name,Phone,Email", "Zed One,(909) 194-0001,", "Zed Two,(909) 194-0002,", "Zed Three,,zed3@example.com"].join("\r\n");

exports.run = async (h) => {
  const p = h.page;
  const dbWhen = async (ok) => {
    let db = await h.db();
    for (let i = 0; i < 40 && !ok(db); i++) { await p.waitForTimeout(150); db = await h.db(); }
    return db;
  };
  await h.go("/clients");
  const before = (await h.db()).customers.length;
  const more = async () => {
    await p.getByRole("button", { name: "Ещё действия" }).first().click();
    await h.sheet().waitFor();
  };
  // nothing yet: the empty state (in-app navigation keeps the demo's memory of imports)
  await more();
  await h.sheet().getByRole("button", { name: "Импорты" }).click();
  await p.getByText("Импортов ещё не было").first().waitFor({ timeout: 5000 });
  h.expect(/\/client\/imports$/.test(p.url()), `«…» → «Импорты» (${p.url()})`);
  await p.getByTestId(h.layout.width > 390 ? "side-clients" : "tab-clients").locator("visible=true").first().click();
  await p.getByRole("button", { name: "Ещё действия" }).first().waitFor();

  await more();
  await h.sheet().getByRole("button", { name: "Импорт из CSV" }).click();
  const chooser = p.waitForEvent("filechooser");
  await p.getByRole("button", { name: "Выбрать файл CSV" }).click();
  await (await chooser).setFiles({ name: "zed.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
  await p.getByText(/zed\.csv · строк: 3/).first().waitFor({ timeout: 5000 });
  await p.getByRole("button", { name: "Импортировать (3)" }).click();
  await p.getByTestId("import-result").locator("visible=true").first().waitFor({ timeout: 10000 });
  await dbWhen((d) => d.customers.length === before + 3);
  await p.getByRole("button", { name: "К клиентам" }).click();
  await p.waitForTimeout(400);

  await more();
  await h.sheet().getByRole("button", { name: "Импорты" }).click();
  const card = p.locator('[data-testid^="import-job-"]').locator("visible=true").first();
  await card.waitFor({ timeout: 5000 });
  const text = await card.innerText();
  h.expect(/zed\.csv/.test(text) && /добавлено 3, возможных дублей 0, пропущено 0/.test(text) && /Загружен/.test(text), `the card: file, counts, status (${text})`);
  await h.shot("list");

  await card.getByRole("button", { name: "Отменить импорт" }).click();
  await h.sheet().getByText(/Клиенты со сметами, работами, оплатами, заметками остаются/).waitFor();
  await h.shot("confirm");
  await h.sheet().getByRole("button", { name: "Да, отменить импорт" }).click();
  await h.expectText(/Импорт отменён: снято клиентов 3/, "the toast says how many were taken back");
  const db = await dbWhen((d) => d.customers.length === before);
  h.expect(db.customers.length === before && !db.customers.some((c) => c.name.startsWith("Zed ")), `the clients are gone (${db.customers.length - before})`);
  const after = await p.locator('[data-testid^="import-job-"]').locator("visible=true").first().innerText();
  h.expect(/Отменён/.test(after) && /снято 3, оставлено 0/.test(after), `the card: «Отменён» (${after})`);
  h.expect((await p.locator('[data-testid^="import-job-"]').locator("visible=true").first().getByRole("button", { name: "Отменить импорт" }).count()) === 0, "no second undo");
};
