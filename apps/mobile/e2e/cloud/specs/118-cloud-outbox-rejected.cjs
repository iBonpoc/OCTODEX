/**
 * e2e 118 — a money change the server refused does not vanish silently, against a real Supabase (docs/specs/23 §3,
 * decision of the director 07.11; rule 6). The server's answer is replaced in the browser (page.route), the rest is the
 * real stack: an expense queued with four refusals already gets its fifth (403 / 42501) → it leaves the outbox, and
 * - «Профиль и аккаунт» shows the card «Расход не записан на сервере» (our own words, not the server's English text);
 * - «Требует внимания» has it first;
 * - «Понятно» takes it away from both.
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
  const left = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.outbox.v1") || "[]").map((x) => x.id));
  h.expect(!left.includes("q-rej"), `the refused op left the outbox (${left})`);
  await h.shot("profile");

  // «Требует внимания»: first
  await h.go("/triage");
  for (let i = 0; i < 20 && !/Расход не записан на сервере/.test(await h.text()); i++) await p.waitForTimeout(500);
  h.expect(/Расход не записан на сервере/.test(await h.text()), "«Требует внимания» has it");
  await h.shot("triage");

  // «Понятно»: gone from both
  await h.go("/settings/profile");
  await p.getByTestId("rejected-q-rej").last().getByRole("button", { name: "Понятно" }).click();
  for (let i = 0; i < 10 && (await p.getByTestId("rejected-q-rej").count()) > 0; i++) await p.waitForTimeout(300);
  h.expect((await p.getByTestId("rejected-q-rej").count()) === 0, "«Понятно»: the card is gone");
  await h.go("/triage");
  await p.waitForTimeout(500);
  h.expect(!/Расход не записан на сервере/.test(await h.text()), "«Понятно»: and from «Требует внимания»");
  await p.unroute("**/rest/v1/**", refuse);
};
