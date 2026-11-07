/**
 * e2e 114 — the queue when the server answers with an error, against a real Supabase (docs/specs/23 §3; rule 6).
 * The server's answers are replaced in the browser (page.route), the rest is the real stack:
 * 1. «Сервер недоступен»: every write gets 503 / PGRST002 → the header says «Сервер недоступен · в очереди: 1», not
 *    «Без сети»; the answer is let through → the lead reaches the server.
 * 2. «Не отправлено»: one change keeps getting a statement timeout (500 / 57014) for over 10 minutes (seeded with its
 *    first failure 11 minutes ago, so the test does not wait) → it is a card in «Мои настройки» and «Не отправлено: 1»;
 *    a lead typed meanwhile does not wait for it and reaches the server; «Повторить сейчас» with the server well again
 *    sends it; another stuck change is discarded with «Отменить изменение…» → «Да, отменить» (rule 5).
 */
const { signIn, waitRows } = require("../signIn.cjs");

const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

async function newLead(h, name) {
  const p = h.page;
  await h.go("/lead/new");
  await p.getByPlaceholder("(555) 555-0100").last().pressSequentially(`626555${String(Date.now()).slice(-4)}`);
  await p.getByPlaceholder("Имя", { exact: true }).last().fill(name);
  await p.getByPlaceholder("Улица, дом, офис").last().fill("114 Cloud St");
  await p.getByPlaceholder("Pasadena").last().fill("Glendale");
  await h.click("Сохранить лид");
  await p.waitForTimeout(700);
}

// the browser logs every 5xx answer as a console error: here they are the test's own
exports.allowConsole = [/status of 50[03]/, /Failed to load resource/];

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const A = a1.companyId;
  await signIn(h, a1);

  // 1. the whole server answers «not now»
  const down = async (route) => {
    if (route.request().method() === "GET") return route.continue();
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "PGRST002", message: "Could not query the database for the schema cache" }) });
  };
  await p.route("**/rest/v1/**", down);
  await newLead(h, "Nightly Lead 114 A");
  let t = "";
  for (let i = 0; i < 30 && !/Сервер недоступен · в очереди: \d/.test(t); i++) {
    await p.waitForTimeout(500);
    t = await h.text();
  }
  h.expect(/Сервер недоступен · в очереди: \d/.test(t), "503 / PGRST002: «Сервер недоступен», with the queue");
  h.expect(!/Без сети · в очереди/.test(t), "not «Без сети»: the network is there");
  await h.shot("server-down");
  await p.unroute("**/rest/v1/**", down);
  await p.evaluate(() => window.dispatchEvent(new Event("online"))); // no waiting out the pause
  await waitRows(admin, `leads?company_id=eq.${A}&contact_name=eq.Nightly Lead 114 A&select=id`, (r) => r.length === 1, "the lead typed while the server was down", 90_000);

  // 2. one change keeps getting a timeout: stuck, shown, not holding the others
  const stuckId = uuid();
  const goneId = uuid();
  const owner = { userId: a1.userId, companyId: A };
  const since = new Date(Date.now() - 11 * 60_000).toISOString();
  const at = new Date(Date.now() - 60_000).toISOString();
  await p.evaluate(
    ([items]) => localStorage.setItem("octo.outbox.v1", JSON.stringify(items)),
    [[
      { id: "q-stuck", op: { k: "calendarEvent.remove", id: stuckId }, at, tries: 0, owner, fails: 2, failSince: since },
      // money: its confirmation warns (review #259 круг 3, п.5). Already stuck: an expense is not its own kind, it waits
      // behind q-stuck and is never tried in this test — so it comes stuck from an earlier run
      { id: "q-gone", op: { k: "expense.add", id: goneId, jobId: null, vendor: "Nightly 114", category: "materials", amountCents: 1234 }, at, tries: 0, owner, fails: 3, failSince: since, stuck: true },
    ]],
  );
  const timeout = async (route) => {
    if (route.request().method() === "GET" || !/calendar_events|expenses/.test(route.request().url())) return route.continue();
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ code: "57014", message: "canceling statement due to statement timeout" }) });
  };
  await p.route("**/rest/v1/**", timeout);
  await h.go("/settings");
  // both cards: q-gone comes stuck at once, q-stuck only after its third timeout — wait for that one, not for the title
  const cards = async () => (await p.getByTestId("stuck-q-stuck").count()) > 0 && (await p.getByTestId("stuck-q-gone").count()) > 0;
  for (let i = 0; i < 40 && !(await cards()); i++) await p.waitForTimeout(500);
  t = await h.text();
  h.expect(/Не отправлено: сервер отвечает ошибкой/.test(t), "the stuck changes are a section in «Мои настройки»");
  h.expect((await p.getByTestId("stuck-q-stuck").count()) > 0 && (await p.getByTestId("stuck-q-gone").count()) > 0, "each is its own card");
  h.expect(/Ошибка на сервере, не в телефоне/.test(t) && !/canceling statement/.test(t), "our own words on the card, not the server's English text");

  // a lead typed meanwhile does not wait for them (two timeouts in a row read as the whole server for a moment; the
  // lead's answer ends that — then the header names the stuck ones)
  await newLead(h, "Nightly Lead 114 B");
  await p.evaluate(() => window.dispatchEvent(new Event("online")));
  await waitRows(admin, `leads?company_id=eq.${A}&contact_name=eq.Nightly Lead 114 B&select=id`, (r) => r.length === 1, "the lead typed while two changes were stuck", 30_000);
  await h.go("/settings");
  for (let i = 0; i < 20 && !/Не отправлено: 2/.test(t); i++) {
    await p.waitForTimeout(500);
    t = await h.text();
  }
  h.expect(/Не отправлено: 2/.test(t), "the header: «Не отправлено: 2»");
  await h.shot("stuck");

  // «Отменить изменение…» → the second step says what happens → «Да, отменить»
  await h.go("/settings");
  const gone = p.getByTestId("stuck-q-gone").last();
  await gone.getByRole("button", { name: "Отменить изменение…" }).click();
  await p.waitForTimeout(300);
  h.expect((await p.getByTestId("stuck-confirm-q-gone").count()) > 0, "a second step before discarding (rule 5)");
  await h.expectText(/На сервер оно не попадёт/, "it says what discarding does");
  h.expect((await p.getByTestId("stuck-money-q-gone").count()) > 0, "money: the «Деньги» chip in the second step");
  await h.expectText(/Это деньги: счёт, оплата, задаток или расход/, "money: the warning in words");
  await p.getByTestId("stuck-confirm-q-gone").last().getByRole("button", { name: "Да, отменить" }).click();
  await p.waitForTimeout(700);
  h.expect((await p.getByTestId("stuck-q-gone").count()) === 0, "the discarded change is gone");
  const left = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.outbox.v1") || "[]").map((x) => x.id));
  h.expect(!left.includes("q-gone") && left.includes("q-stuck"), `the discarded op left the phone, the other stays (${left})`);

  // the server is well again: «Повторить сейчас» sends it, the card goes
  await p.unroute("**/rest/v1/**", timeout);
  await p.getByTestId("stuck-q-stuck").last().getByRole("button", { name: "Повторить сейчас" }).click();
  for (let i = 0; i < 30 && (await p.getByTestId("stuck-q-stuck").count()) > 0; i++) await p.waitForTimeout(500);
  h.expect((await p.getByTestId("stuck-q-stuck").count()) === 0, "«Повторить сейчас»: sent, the card is gone");
  t = await h.text();
  h.expect(!/Не отправлено: \d/.test(t), "nothing «not sent» any more");
  await h.shot("retried");
};
