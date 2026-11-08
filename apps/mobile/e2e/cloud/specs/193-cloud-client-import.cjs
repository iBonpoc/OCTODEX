/**
 * e2e 193 — the server import of clients against a real Supabase (docs/specs/04 §14, map S3e). 300 rows go in two
 * batches; the answer of the second is lost AFTER the server wrote it (page.route lets the call through, then breaks
 * the answer) → «Импорт остановлен на строке 252 · нет связи с сервером» → «Продолжить» → the server answers the
 * repeated batch with what it stored: exactly 300 clients, none twice; the result and the list; «Импорты» → «Отменить
 * импорт» → the server takes the 300 cards back (nothing was added to them).
 */
const { signIn } = require("../signIn.cjs");

exports.allowConsole = [/Failed to load resource/, /net::ERR_FAILED/, /Failed to fetch/];

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  await signIn(h, a1);
  const tag = `C193 ${Date.now().toString(36)}`;
  // phones of this run only (a second run on the same database must not find the first run's clients)
  const exch = 200 + (Date.now() % 700);
  const rows = Array.from({ length: 300 }, (_, i) => `${tag} ${String(i).padStart(3, "0")},(909) ${exch}-${String(1000 + i)},,${exch}${i + 1} Cloud Way,Pasadena`);
  const CSV = ["Name,Phone,Email,Address,City", ...rows].join("\r\n");

  let calls = 0;
  await p.route("**/rest/v1/rpc/import_customers", async (route) => {
    calls++;
    if (calls !== 2) return route.continue();
    await route.fetch(); // the server writes the batch…
    return route.abort("failed"); // …and the phone never hears back
  });

  await h.go("/client/import");
  const chooser = p.waitForEvent("filechooser");
  await p.getByRole("button", { name: "Выбрать файл CSV" }).click();
  await (await chooser).setFiles({ name: "cloud193.csv", mimeType: "text/csv", buffer: Buffer.from(CSV, "utf8") });
  await p.getByText(/cloud193\.csv · строк: 300/).first().waitFor({ timeout: 10000 });
  await p.getByRole("button", { name: "Импортировать (300)" }).click();
  await p.getByText(/Импорт остановлен на строке 252/).first().waitFor({ timeout: 30000 });
  await h.expectText(/нет связи с сервером/, "the break says why");
  await h.shot("stopped");

  await p.getByRole("button", { name: "Продолжить" }).click();
  await p.getByTestId("import-result").locator("visible=true").first().waitFor({ timeout: 30000 });
  await h.expectText(/Готово: добавлено 300, возможных дублей 0, пропущено 0/, "the result after «Продолжить»");
  const made = await admin(`customers?select=id&company_id=eq.${a1.companyId}&deleted_at=is.null&display_name=like.${encodeURIComponent(tag)}*`);
  h.expect(made.length === 300, `exactly 300 clients on the server, none twice (${made.length})`);
  const [job] = await admin(`import_jobs?select=status,counts&company_id=eq.${a1.companyId}&file_name=eq.cloud193.csv&order=created_at.desc&limit=1`);
  h.expect(job && job.status === "applied" && job.counts.added === 300, `the job is applied (${JSON.stringify(job)})`);
  await p.getByRole("button", { name: "К клиентам" }).click();
  await h.expectText(new RegExp(`${tag} 000`), "the imported clients are in the list");
  await h.shot("done");

  // «Импорты» (PR 3): the job from the server, «Отменить импорт» → the server takes the 300 cards back
  await p.getByRole("button", { name: "Ещё действия" }).first().click();
  await h.sheet().getByRole("button", { name: "Импорты" }).click();
  const card = p.locator('[data-testid^="import-job-"]').filter({ hasText: "cloud193.csv" }).locator("visible=true").first();
  await card.waitFor({ timeout: 15000 });
  const text = await card.innerText();
  h.expect(/добавлено 300/.test(text) && /Загружен/.test(text), `the server's import on «Импорты» (${text})`);
  await card.getByRole("button", { name: "Отменить импорт" }).click();
  await h.sheet().getByRole("button", { name: "Да, отменить импорт" }).click();
  await p.getByText(/Импорт отменён: снято клиентов 300/).first().waitFor({ timeout: 20000 });
  const left = await admin(`customers?select=id&company_id=eq.${a1.companyId}&deleted_at=is.null&display_name=like.${encodeURIComponent(tag)}*`);
  h.expect(left.length === 0, `the server took the import back (${left.length} left)`);
  await h.shot("undone");
};
