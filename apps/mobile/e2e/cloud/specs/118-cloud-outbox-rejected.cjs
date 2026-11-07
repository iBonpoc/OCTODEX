/**
 * e2e 118 — a money change the server refused does not vanish silently, against a real Supabase (docs/specs/23 §3,
 * decision of the director 07.11; rule 6). The server's answer is replaced in the browser (page.route), the rest is the
 * real stack: an expense queued with four refusals already gets its fifth (403 / 42501) → it leaves the outbox, and
 * - «Профиль и аккаунт» shows the card «Расход не записан на сервере» (our own words, not the server's English text);
 * - «Требует внимания» has it first in «Разобрать» (by testID) and on «Главная»; «Открыть» opens the record;
 * - «Понятно» in «Разобрать» takes it away from both.
 */
const { signIn } = require("../signIn.cjs");

const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

// the browser logs the replaced 403 as a console error: here it is the test's own
exports.allowConsole = [/status of 403/, /Failed to load resource/];

exports.run = async (h, { seed }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  await signIn(h, a1);

  const owner = { userId: a1.userId, companyId: a1.companyId };
  const at = new Date(Date.now() - 60_000).toISOString();
  await p.evaluate(
    ([items]) => localStorage.setItem("octo.outbox.v1", JSON.stringify(items)),
    [[{ id: "q-rej", op: { k: "expense.add", id: uuid(), jobId: null, vendor: "Nightly 118", category: "materials", amountCents: 4321 }, at, tries: 4, owner }]],
  );
  const refuse = async (route) => {
    if (route.request().method() === "GET" || !/expenses/.test(route.request().url())) return route.continue();
    return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "42501", message: "new row violates row-level security policy for table \"expenses\"" }) });
  };
  await p.route("**/rest/v1/**", refuse);
  await h.go("/settings/profile");
  await p.evaluate(() => window.dispatchEvent(new Event("online")));

  // the card itself, not the section title (CHECKS §9 №3)
  for (let i = 0; i < 40 && (await p.getByTestId("rejected-q-rej").count()) === 0; i++) await p.waitForTimeout(500);
  h.expect((await p.getByTestId("rejected-q-rej").count()) > 0, "the refused expense is a card in «Профиль и аккаунт»");
  const card = await p.getByTestId("rejected-q-rej").last().innerText();
  h.expect(/Расход не записан на сервере/.test(card) && /\$43\.21/.test(card), `what it was and its amount (${card})`);
  h.expect(!/row-level|violates/.test(card), "our own words, not the server's English text");
  // the outbox is written to the phone 250 ms after the change (persist): wait for it, not for the card (CHECKS §9 №3)
  const outboxIds = () => p.evaluate(() => JSON.parse(localStorage.getItem("octo.outbox.v1") || "[]").map((x) => x.id));
  let left = await outboxIds();
  for (let i = 0; i < 25 && left.includes("q-rej"); i++) {
    await p.waitForTimeout(200);
    left = await outboxIds();
  }
  h.expect(!left.includes("q-rej"), `the refused op left the outbox (${left})`);
  await h.shot("profile");

  // «Разобрать»: first — the top card itself, by its testID (CHECKS §9 №3)
  await h.go("/triage");
  for (let i = 0; i < 20 && (await p.getByTestId("triage-top-rej-q-rej").count()) === 0; i++) await p.waitForTimeout(500);
  h.expect((await p.getByTestId("triage-top-rej-q-rej").count()) > 0, "«Разобрать»: the refused expense is the top card");
  await h.shot("triage");

  // «Главная»: in «Требует внимания» too
  await h.go("/today");
  for (let i = 0; i < 20 && !/Расход не записан на сервере/.test(await h.text()); i++) await p.waitForTimeout(500);
  h.expect(/Расход не записан на сервере/.test(await h.text()), "«Главная»: «Требует внимания» has it");

  // «Открыть» on the top card of «Разобрать»: the record it was about (an expense without a job — the profile, where
  // its card is); the page changes, so the press is seen
  await h.go("/triage");
  for (let i = 0; i < 20 && (await p.getByTestId("triage-top-rej-q-rej").count()) === 0; i++) await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Открыть" }).first().click();
  await p.waitForURL(/\/settings\/profile/, { timeout: 10_000 }).catch(() => {});
  h.expect(/\/settings\/profile/.test(p.url()) && (await p.getByTestId("rejected-q-rej").count()) > 0, `«Открыть»: the record (${p.url()})`);

  // «Понятно» in «Разобрать»: gone from both
  await h.go("/triage");
  for (let i = 0; i < 20 && (await p.getByTestId("triage-top-rej-q-rej").count()) === 0; i++) await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Понятно" }).last().click();
  for (let i = 0; i < 10 && (await p.getByTestId("triage-top-rej-q-rej").count()) > 0; i++) await p.waitForTimeout(300);
  h.expect((await p.getByTestId("triage-top-rej-q-rej").count()) === 0, "«Понятно»: gone from «Разобрать»");
  // the change is written to the phone a moment later (250 ms): wait for that before a page load, not seconds (CHECKS §9 №3)
  const stored = () => p.evaluate(() => (localStorage.getItem("octo.cloud.v1.rejected") || "").includes("q-rej"));
  for (let i = 0; i < 20 && (await stored()); i++) await p.waitForTimeout(200);
  h.expect(!(await stored()), "«Понятно» is written to the phone");
  await h.go("/settings/profile");
  await p.waitForTimeout(500);
  h.expect((await p.getByTestId("rejected-q-rej").count()) === 0, "«Понятно»: and its card in the profile");
  await p.unroute("**/rest/v1/**", refuse);
};
