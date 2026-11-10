/**
 * Wave 7-2 — «Команда» и приглашение (story map S21; docs/specs/13 §3.13, 19 §2 п.3–4). Demo mode; the server side is db T48.
 * - «Пригласить»: name, email, ONE role (Мастер · Продажи · Диспетчер · Директор) or «Субподрядчик» → a card «Приглашён»;
 * - the invited card: «Отправить ещё раз», «Отменить приглашение» (asks first) → the card is gone;
 * - a person (a subcontractor too): «Отключить» (asks first) → «Отключён», last in the list, out of the pickers; «Включить снова» brings them back;
 * - the invitation link page /auth/invite: no link → «не найдена»; signed out → «Войдите…» (demo explains).
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  const cards = () => p.locator('[data-testid="list-card"]:visible');
  const cardOf = (name) => cards().filter({ hasText: name }).first();
  const sheet = (id) => p.getByTestId(id).locator("visible=true");
  await h.go("/today");
  await setRole(h, "director");
  await h.go("/team");

  // invite: one role
  await p.getByRole("button", { name: "Пригласить", exact: true }).locator("visible=true").first().click();
  const form = p.locator('[aria-modal="true"]').filter({ hasText: "Отправить приглашение" }).last();
  await form.waitFor({ timeout: 3000 });
  const radio = (r) => form.getByRole("radio", { name: r, exact: true }).locator("visible=true");
  // the sheet slides in (820/1280: a side panel a moment later) — wait for its items, count only the visible ones
  await radio("Мастер").first().waitFor({ timeout: 5000 });
  for (const r of ["Мастер", "Продажи", "Диспетчер", "Директор"]) h.expect((await radio(r).count()) === 1, `one-choice role «${r}»`);
  const send = form.getByRole("button", { name: "Отправить приглашение" });
  await form.getByPlaceholder("Имя").fill("Nina Invite");
  await form.getByPlaceholder("Email").fill("nina@");
  h.expect(await send.isDisabled(), "a broken email does not send");
  await form.getByPlaceholder("Email").fill("nina@example.com");
  await radio("Продажи").click();
  await h.shot("invite-form");
  await send.click();
  await p.waitForTimeout(700);
  let db = await h.db();
  const nina = db.members.find((m) => m.name === "Nina Invite");
  h.expect(!!nina && nina.pending && JSON.stringify(nina.roles) === '["sales"]' && !!nina.expiresAt, `invited with one role (${JSON.stringify(nina)})`);
  const nt = await cardOf("Nina Invite").innerText();
  h.expect(nt.includes("Приглашён") && nt.includes("Продажи"), `the invited card: ${nt.slice(0, 120)}`);

  // the invited card: send again, then cancel (asks first)
  await cardOf("Nina Invite").click();
  await sheet("invite-sheet").waitFor({ timeout: 3000 });
  await h.expectText(/nina@example\.com/, "the email on the invitation");
  await sheet("invite-sheet").getByRole("button", { name: "Отправить ещё раз" }).click();
  await h.expectText(/Новая ссылка для Nina Invite/, "send again");
  await p.waitForTimeout(400);
  await cardOf("Nina Invite").click();
  await sheet("invite-sheet").waitFor({ timeout: 3000 });
  await sheet("invite-sheet").getByRole("button", { name: "Отменить приглашение" }).click();
  await h.expectText(/Ссылка перестанет работать/, "asks first");
  await sheet("invite-sheet").getByRole("button", { name: "Да, отменить" }).click();
  await p.waitForTimeout(600);
  h.expect((await cards().filter({ hasText: "Nina Invite" }).count()) === 0, "the cancelled invitation is gone");

  // switch a person off and back on
  db = await h.db();
  const who = db.members.find((m) => m.id !== db.me && !m.pending && m.kind === "employee" && m.roles.includes("tech"));
  h.expect(!!who, "a tech on the team");
  await cardOf(who.name).click();
  await sheet("member-sheet").waitFor({ timeout: 3000 });
  await sheet("member-sheet").getByRole("button", { name: "Отключить" }).click();
  await h.expectText(/Его выезды, сметы и оплаты останутся/, "asks first, records stay");
  await sheet("member-sheet").getByRole("button", { name: "Да, отключить" }).click();
  await p.waitForTimeout(600);
  db = await h.db();
  const offM = db.members.find((m) => m.id === who.id);
  h.expect(!!offM && offM.disabled && offM.pending, "kept (old records keep the name), switched off and out of the pickers");
  const last = cards().last();
  h.expect((await last.innerText()).includes(who.name) && (await last.innerText()).includes("Отключён"), "«Отключён», last in the list");
  await h.shot("disabled");
  await cardOf(who.name).click();
  await sheet("member-sheet").getByRole("button", { name: "Включить снова" }).click();
  await p.waitForTimeout(600);
  db = await h.db();
  const backM = db.members.find((m) => m.id === who.id);
  h.expect(!!backM && !backM.disabled && !backM.pending, "back on the team");

  // a subcontractor's card opens too: nothing to sign, only «Отключить» (review #193)
  const sub = db.members.find((m) => m.kind === "sub" && !m.pending);
  if (sub) {
    await cardOf(sub.name).click();
    await sheet("member-sheet").waitFor({ timeout: 3000 });
    await h.expectText(new RegExp(`Субподрядчик: ${sub.name}`), "the subcontractor's own sheet");
    h.expect((await sheet("member-sheet").getByRole("button", { name: "Отключить" }).count()) === 1, "a subcontractor can be switched off");
    h.expect((await sheet("member-sheet").getByPlaceholder("Должность (под подписью)").count()) === 0, "no signing fields for a subcontractor");
    await pressEscUntilClosed(p);
  }

  // the invitation link page
  await h.go("/auth/invite");
  await h.expectText(/Ссылка-приглашение не найдена/, "no link");
  await h.go(`/auth/invite?token=${"a1".repeat(24)}`);
  await sheet("invite-accept").waitFor({ timeout: 3000 });
  await h.expectText(/Войдите или создайте аккаунт/, "sign in first");
  await h.expectText(/демо-режим/, "demo explains");
  await p.getByRole("button", { name: "Войти и принять" }).locator("visible=true").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/auth/sign-in" && p.url().includes("next=invite"), `then sign-in, back to the invitation after (${p.url()})`);

  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${h.layout.width}`);
};
