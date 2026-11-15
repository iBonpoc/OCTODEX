/**
 * e2e 418 cloud — #1669 on a real Supabase: changes of a company the person is NOT in (the seeded a1 never was in company B)
 * are on the phone — the sheet «Вас убрали из компании» says how many, although a1 has a company of his own. «Оставить» closes it
 * and the changes stay (back at the next start); «Убрать…» asks first (rule 5), «Нет» changes nothing, «Да, убрать» drops them.
 * Another person's changes and a2's own company's changes are never touched.
 */
const { signIn, seedOutbox } = require("../signIn.cjs");

const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));

exports.run = async (h, { seed }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  const b1 = seed.users.b1;
  await signIn(h, a1);

  const op = (vendor, companyId, userId = a1.userId) => ({
    id: `q-${uuid()}`,
    op: { k: "expense.add", id: uuid(), jobId: null, vendor, category: "materials", amountCents: 1234 },
    at: new Date(Date.now() - 60_000).toISOString(),
    tries: 0,
    owner: { userId, companyId },
  });
  // two changes of a1 in company B (he is not in it), one of his own company, one of another person in B
  await seedOutbox(h, [op("Nightly 418 B1", b1.companyId), op("Nightly 418 B2", b1.companyId), op("Nightly 418 mine", a1.companyId), op("Nightly 418 other", b1.companyId, b1.userId)]);
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  const outbox = () => p.evaluate(() => JSON.parse(localStorage.getItem("octo.outbox.v1") || "[]"));
  const mineInB = async () => (await outbox()).filter((o) => o.owner?.userId === a1.userId && o.owner?.companyId === b1.companyId).length;

  await h.go("/settings/profile");
  await vis("removed-notice").first().waitFor({ timeout: 25000 });
  const text = await vis(`removed-unsent-${b1.companyId}`).first().innerText();
  h.expect(/2/.test(text), `the sheet counts a1's two changes in B (${text})`);
  await h.shot("notice");

  // «Оставить»: closed, nothing lost
  await vis("removed-keep").first().click();
  await vis("removed-notice").first().waitFor({ state: "detached", timeout: 8000 });
  h.expect((await mineInB()) === 2, "«Оставить»: the changes stay on the phone");

  // the next start: it is back; «Убрать…» → «Нет» → nothing; «Убрать…» → «Да, убрать» → dropped
  await h.go("/settings/profile");
  await vis("removed-notice").first().waitFor({ timeout: 25000 });
  await vis("removed-drop").first().click();
  await vis("removed-drop-no").first().click();
  h.expect((await mineInB()) === 2, "«Нет»: nothing removed");
  await vis("removed-drop").first().click();
  await vis("removed-drop-yes").first().click();
  await vis("removed-notice").first().waitFor({ state: "detached", timeout: 8000 });
  h.expect((await mineInB()) === 0, "«Да, убрать»: a1's changes in B are gone");
  const left = await outbox();
  h.expect(left.some((o) => o.owner?.companyId === a1.companyId) && left.some((o) => o.owner?.userId === b1.userId), "his own company's changes and the other person's stay");
};
