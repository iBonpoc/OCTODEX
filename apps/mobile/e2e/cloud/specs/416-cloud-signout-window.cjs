/**
 * e2e 416 cloud — #1662 on a real Supabase: a sign-out with nothing unsent has no window; with an estimate draft that never became
 * an estimate it asks first («Черновики: M — …», and «Не отправлено: N» only with a queue). «Подождать» leaves the window, stays
 * signed in and keeps the draft; «Выйти и стереть» signs out and the draft goes with the company's data on the phone.
 */
const { signIn } = require("../signIn.cjs");

exports.run = async (h, { seed }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  const out = () => vis("account-sign-out").first();

  // nothing unsent: the plain sign-out, no window
  await signIn(h, a1);
  await out().waitFor({ timeout: 20000 });
  await out().click();
  await out().waitFor({ state: "detached", timeout: 20000 });
  h.expect((await vis("signout-ask").count()) === 0, "nothing unsent: no window");

  await signIn(h, a1);
  const key = `octo.drafts.v1.${a1.companyId}.${a1.userId}`;
  const draft = {
    ctx: "new|||||",
    at: new Date().toISOString(),
    estimateId: "e2e-416-draft",
    title: "Gate (test) 416",
    doc: { options: [{ lines: [{ name: "Gate (test)", unitPriceCents: 1000 }] }] },
    checkPrice: [],
  };
  await h.seed(key, [draft]);
  await h.go("/settings/profile");

  await out().waitFor({ timeout: 20000 });
  await out().click();
  await vis("signout-ask").first().waitFor({ timeout: 8000 });
  const drafts = await vis("signout-drafts").first().innerText();
  h.expect(/Черновики: 1/.test(drafts), `the drafts line (${drafts})`);
  h.expect((await vis("signout-queue").count()) === 0, "no queue — no «Не отправлено» line");
  await h.shot("ask");

  // «Подождать»: the window goes, the person stays, the draft stays
  await vis("signout-wait").first().click();
  await vis("signout-ask").first().waitFor({ state: "detached", timeout: 8000 });
  h.expect((await out().count()) === 1, "«Подождать»: still signed in");
  h.expect((await p.evaluate((k) => localStorage.getItem(k), key)) !== null, "«Подождать»: the draft is kept");

  // «Выйти и стереть»: signed out, the draft is gone
  await out().click();
  await vis("signout-exit").first().click();
  await p.waitForFunction((k) => localStorage.getItem(k) === null, key, { timeout: 20000 });
  h.expect((await p.evaluate((k) => localStorage.getItem(k), key)) === null, "«Выйти и стереть»: the draft went with the wipe");
  await out().waitFor({ state: "detached", timeout: 20000 });
};
