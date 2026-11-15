/**
 * Wave 7а-2b — a person who deleted their account (story map S22; docs/specs/19 §6.10–§6.11). Demo mode: the spec plants
 * a deleted person (the cloud read is cloud/repo.ts deletedMembers, unit deletedMember.test.ts; the server side is db T50).
 * - «Команда»: they are not on the team;
 * - a visit with only them: «Не назначено» in the Plan, «Выезд без мастера» in «Требует внимания», never «опаздывает»;
 *   «Когда и кто» on the visit names «Удалённый пользователь»;
 * - «Назначить»: they are not in the sheet and not kept — saving Ivan gives [Ivan] (before 7а-2b the hidden person stayed
 *   on the list and the server refused the whole change);
 * - «Оплаты»: «Принял: Удалённый пользователь»;
 * - a «Чей план» saved on the deleted person falls back to «Все» (the columns of the people at work are shown).
 * v6 is put an hour back on the company's today (not before its midnight), so it would be «late» if a deleted person
 * counted (review #216: the late rule is checked, not just the text).
 */
const { todayKey, minuteOf, atMinute } = require("../companyTime.cjs");
const GONE = "Удалённый пользователь";

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  const db0 = await h.db();
  const pay = db0.payments.find((x) => x.receivedBy);
  h.expect(db0.visits.find((x) => x.id === "v6"), "demo has v6 (today, nobody on it)");
  h.expect(pay, "demo has a payment with «принял»");
  // an hour ago on the company's clock, never before its midnight; «late» from 15 minutes after the start
  const nowMin = minuteOf(Date.now());
  const start = atMinute(todayKey(), Math.max(0, nowMin - 60));
  const wouldBeLate = nowMin - Math.max(0, nowMin - 60) >= 16;
  await p.evaluate(({ payId, start }) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.members = [...raw.db.members.filter((m) => m.id !== "m-gone"), { id: "m-gone", name: "", initials: "—", kind: "employee", roles: ["tech"], pending: true, deleted: true }];
    raw.db.visits = raw.db.visits.map((v) => (v.id === "v6" ? { ...v, techId: "m-gone", assigneeIds: ["m-gone"], start, step: "scheduled", closed: false } : v));
    raw.db.payments = raw.db.payments.map((x) => (x.id === payId ? { ...x, receivedBy: "m-gone" } : x));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("day"));
    // «Чей план» saved on the person who is gone now
    localStorage.setItem("octo.planWho.v1", JSON.stringify("m-gone"));
  }, { payId: pay.id, start });
  const v6 = db0.visits.find((x) => x.id === "v6");
  const prop = db0.properties.find((x) => x.id === v6.propertyId);
  const client = db0.customers.find((c) => c.id === prop?.customerId)?.name ?? db0.leads.find((l) => l.id === v6.leadId)?.name;
  h.expect(client, "v6 has a client or a lead");

  // «Команда»: not there
  await h.go("/team");
  await h.expectText(/Alex Petrov/, "the team is shown");
  h.expect(!(await h.text()).includes(GONE), "a deleted person is not on the team");

  // «Требует внимания»: the visit is «без мастера», not late
  await h.go("/today");
  await h.expectText(new RegExp(`Выезд без мастера · ${client}`), "the visit with only a deleted person is unassigned");
  const today = await h.text();
  h.expect(!today.includes(`→ ${client}`), "never «Мастер опаздывает» for it");
  if (wouldBeLate) h.expect(!/Мастер опаздывает · +→/.test(today), "no late item without a person (the rule is checked: v6 is 1 h past its start)");

  // the Plan (day): «Чей план» back to «Все»; v6 is in the group «Не назначено · N»
  await h.go("/plan");
  await h.expectText(/Ivan Sokolov/, "a «Чей план» on a deleted person falls back to «Все»: the people's columns are shown");
  const group = p.getByTestId("plan-unassigned").locator("visible=true").first();
  await group.waitFor({ timeout: 4000 });
  h.expect((await group.innerText()).includes(client), `v6 (${client}) is in «Не назначено · N» of the day`);

  // the visit names them; «Назначить» does not keep them
  await h.go("/visit/v6");
  await h.expectText(new RegExp(GONE), "«Когда и кто» names «Удалённый пользователь»");
  await h.expectText(/Не назначен(?!о)/, "the visit's chip: «Не назначен» (one rule with the Plan)");
  await p.getByRole("button", { name: "Назначить", exact: true }).first().click();
  await h.expectText(/Кому назначить/, "the assign sheet");
  await h.sheet().getByText("Ivan Sokolov").first().waitFor({ timeout: 4000 });
  h.expect(!(await h.sheet().innerText()).includes(GONE), "a deleted person is not in the sheet");
  await h.sheet().getByText("Ivan Sokolov").first().click();
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForTimeout(500);
  const v = (await h.db()).visits.find((x) => x.id === "v6");
  h.expect(JSON.stringify(v.assigneeIds) === JSON.stringify(["m-ivan"]) && v.techId === "m-ivan", `only Ivan is kept (${JSON.stringify(v.assigneeIds)})`);

  // «Оплаты»: who took it
  await h.go("/payments");
  const html = await p.content();
  h.expect(html.includes(GONE), "«Принял: Удалённый пользователь» on the payment");
  await h.shot("payments");
};
