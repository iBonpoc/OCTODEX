/**
 * Step 17 C3 — the server import of clients (docs/specs/04 §14, map S3e), in the demo (the same screen and run; the
 * server itself is db T138–T139 and the cloud e2e 193):
 * - a file of 600 rows: the check shows three groups — «Добавим», «Добавим — возможный дубль: Sarah Mitchell» (only
 *   her property's address), «Пропустим» (her phone; a repeat in the file);
 * - «Импортировать» → «Загружено 600 из 600» in batches of 250 → the result; «Скачать отчёт» saves a CSV with every
 *   row that is not a plain «added», formulas made text;
 * - the clients list: the new card with only her address carries «Возможный дубль» (S3d), nothing was merged;
 * - the same file again: every row is «Уже есть клиент» — a repeat never adds twice.
 */
const N = 600;
const head = "Name,Phone,Email,Address,City";
const lines = [];
for (let i = 0; i < N - 3; i++) lines.push(`Imp ${String(i).padStart(3, "0")},(909) 192-${String(i).padStart(4, "0")},,${i + 1} Import Way,Pasadena`);
lines.push("Sarah Twin,(626) 555-0142,,,"); // Sarah Mitchell's phone — skipped, a client already
lines.push("Imp Again,(909) 192-0000,,,"); // the first row's phone — a repeat in the file
lines.push("=Tenant Oak,(909) 192-9999,,1420 Oak Grove Avenue,Pasadena 91103"); // only Sarah's address — added, possible duplicate
const CSV = [head, ...lines].join("\r\n");

exports.run = async (h) => {
  const p = h.page;
  const dbWhen = async (ok) => {
    let db = await h.db();
    for (let i = 0; i < 60 && !ok(db); i++) { await p.waitForTimeout(150); db = await h.db(); }
    return db;
  };
  await h.go("/clients");
  const before = (await h.db()).customers.length;
  await p.getByRole("button", { name: "Ещё действия" }).first().click(); await p.waitForTimeout(300);
  await h.sheet().getByRole("button", { name: "Импорт из CSV" }).click(); await p.waitForTimeout(600);
  const choose = async () => {
    const chooser = p.waitForEvent("filechooser");
    await p.getByRole("button", { name: /Выбрать файл CSV|Другой файл/ }).click();
    await (await chooser).setFiles({ name: "big.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
    await p.getByText(/big\.csv · строк: 600/).first().waitFor({ timeout: 8000 });
  };
  await choose();
  await h.expectText(/Добавим 598 \(из них возможный дубль: 1\), пропустим 2/, "the check: 598 to add, one of them a possible duplicate, 2 skipped");
  await h.expectText(/Добавим — возможный дубль: Sarah Mitchell/, "only the address matched: added, marked, not merged");
  await h.expectText(/Уже есть клиент: Sarah Mitchell/, "her phone: a client already");
  await h.expectText(/Повтор в файле: Imp 000/, "a repeat inside the file");
  await h.shot("check");

  await p.getByRole("button", { name: "Импортировать (598)" }).click();
  await p.getByTestId("import-result").locator("visible=true").first().waitFor({ timeout: 20000 });
  await h.expectText(/Загружено 600 из 600/, "every row answered");
  await h.expectText(/Готово: добавлено 597, возможных дублей 1, пропущено 2/, "the result");
  const db = await dbWhen((d) => d.customers.length >= before + 598);
  h.expect(db.customers.length === before + 598, `598 clients added (${db.customers.length - before})`);
  const twin = db.customers.find((c) => c.name === "=Tenant Oak");
  h.expect(twin && twin.status === "active" && !twin.mergedIntoId, "the possible duplicate is its own active card, nothing merged");
  h.expect(db.customers.find((c) => c.id === "c1")?.status !== "archived", "Sarah Mitchell is untouched");
  await p.getByTestId("import-result").locator("visible=true").first().scrollIntoViewIfNeeded();
  await h.shot("result");

  // the report: the rows that are not a plain «added», a leading «=» made text
  const dl = p.waitForEvent("download");
  await p.getByRole("button", { name: "Скачать отчёт" }).click();
  const file = await (await dl).path();
  const csv = require("node:fs").readFileSync(file, "utf8");
  h.expect(/^line,name,result,reason,who/.test(csv), "the report has a header");
  h.expect(csv.includes("dupClient,Sarah Mitchell") && csv.includes("dupFile,Imp 000"), "the report says why rows were skipped");
  h.expect(csv.includes("'=Tenant Oak,dup_added,,Sarah Mitchell"), `the report: the possible duplicate, «=» made text (${csv.split("\r\n").find((l) => l.includes("Tenant"))})`);

  // the list: the new card carries «Возможный дубль»
  await p.getByRole("button", { name: "К клиентам" }).click(); await p.waitForTimeout(600);
  await h.go(`/client/${twin.id}`);
  await h.expectText(/Возможный дубль/, "the imported card with Sarah's address: «Возможный дубль»");

  // the same file again: nothing to add
  await h.go("/client/import");
  await choose();
  await h.expectText(/Добавим 0, пропустим 600/, "the same file again: every row is a client already");
  h.expect(await p.getByRole("button", { name: "Импортировать (0)" }).isDisabled(), "nothing to import twice");
  await h.shot("again");
};
