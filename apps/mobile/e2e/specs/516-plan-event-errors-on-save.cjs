/**
 * e2e 516 — #2220 (founder 19.11, iPhone 2181: a new empty «Новое событие» showed «Нужно название» at once and a dimmed
 * «Сохранить»). Every view.
 * - «Событие»: the new form says nothing and «Сохранить» is live; «Сохранить» → the form stays, «Нужно название» is under the
 *   name field (the frame of the field is bad, aria-invalid), the focus is in it; a typed name takes the error away; «Сохранить»
 *   → saved (the store, the sheet gone);
 * - «Выходной»: nothing at first; «Сохранить» → «Выберите, чей это выходной» under the people; a person picked → the error goes
 *   → «Сохранить» → saved.
 * Finds things by testID and the store; waits on what it checks (no pauses).
 */
const { sheetGone } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const openAdd = async (what) => {
    await p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible').first().click();
    await tid("fab-planAdd").click();
    await h.sheet().getByText(what, { exact: true }).click();
    await tid("ev-save").waitFor({ timeout: 5000 });
  };
  const count = () => h.db().then((db) => (db.calendarEvents || []).length);

  await h.go("/plan");
  const before = await count();

  // «Событие»: nothing said before a try
  await openAdd("Событие");
  h.expect((await tid("ev-title-error").count()) === 0, "a new event form says nothing before «Сохранить»");
  h.expect(!(await tid("ev-save").isDisabled()), "«Сохранить» is live on a new form");
  await h.shot("new");
  await tid("ev-save").click();
  await tid("ev-title-error").filter({ hasText: "Нужно название" }).waitFor({ timeout: 5000 });
  h.expect((await tid("ev-save").count()) === 1, "the form stays open");
  h.expect((await count()) === before, "nothing is saved with a problem");
  await p.waitForFunction(() => document.activeElement?.closest('[data-testid="ev-title"]') !== null, null, { timeout: 5000 }).catch(() => h.expect(false, "the focus goes to the name field"));
  h.expect((await tid("ev-title").locator('[aria-invalid="true"]').count()) === 1, "the name field is marked invalid");
  await h.shot("error");
  await tid("ev-title").locator("input, textarea").first().fill("T516 crew meeting");
  await tid("ev-title-error").waitFor({ state: "detached", timeout: 5000 });
  await tid("ev-save").click();
  await sheetGone(p);
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.calendarEvents || []).some((e) => e.title === "T516 crew meeting"), "octo.db.v5", { timeout: 5000 }).catch(() => h.expect(false, "the event is saved"));

  // «Выходной»: the person
  await openAdd("Выходной");
  h.expect((await tid("ev-person-error").count()) === 0, "a new day off says nothing before «Сохранить»");
  await tid("ev-save").click();
  await tid("ev-person-error").filter({ hasText: "Выберите, чей это выходной" }).waitFor({ timeout: 5000 });
  await tid("ev-person").getByRole("radio").first().click();
  await tid("ev-person-error").waitFor({ state: "detached", timeout: 5000 });
  await tid("ev-save").click();
  await sheetGone(p);
  await p.waitForFunction(([k, n]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.calendarEvents || []).length === n, ["octo.db.v5", before + 2], { timeout: 5000 }).catch(() => h.expect(false, "the day off is saved too"));
};
