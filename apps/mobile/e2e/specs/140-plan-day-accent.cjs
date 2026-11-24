const { atMinute, todayKey } = require("../companyTime.cjs");
const { accentCount } = require("../accent.cjs");
/**
 * Rule 2 on the Plan's Day (director 07.11, step 10в): one yellow on the screen (v2: the picked day of the strip). «Назначить» under a visit nobody is on
 * is a secondary button: two such visits gave two (three with «＋») yellow buttons before. Every view (3 widths × 2 themes).
 */
const ACC = "rgb(251, 255, 0)";

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const today = todayKey();
  await p.evaluate(({ a, b }) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const [p1, p2] = raw.db.properties;
    const base = { scope: [], checklist: [], photos: [], durationMin: 60, kind: "inspection", techId: null, assigneeIds: [], amountDueCents: 0, step: "scheduled" };
    raw.db.visits = [...raw.db.visits.filter((v) => !String(v.id).startsWith("v140-")), { ...base, id: "v140-a", propertyId: p1.id, start: a }, { ...base, id: "v140-b", propertyId: p2.id, start: b }];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("day"));
  }, { a: atMinute(today, 14 * 60), b: atMinute(today, 15 * 60) });
  await h.go("/plan");
  const got = p.getByRole("button", { name: "Понятно", exact: true }).locator("visible=true");
  // optional: the first-visit hint of the screen shows once per device — close it only when it is there (#800)
  if (await got.count()) { await got.first().click(); await p.waitForTimeout(300); }

  // v2: the phone's Day has no button inside a row — «Не назначено · N» under the day opens the sheet whose rows carry «Назначить»;
  // 820 / 1280: the board by person with «Назначить» under each visit nobody is on
  const phone = h.layout.width < 820;
  await p.getByTestId("plan").locator("visible=true").first().waitFor();
  const n = await accentCount(p);
  h.expect(n <= 1, `one yellow on the Day at most — the picked day (${n})`);
  if (phone) {
    await p.getByTestId("plan-unassigned").locator("visible=true").first().getByRole("button").first().click();
    await p.getByTestId("plan-unassigned-sheet").locator("visible=true").first().waitFor({ timeout: 5000 });
  }
  const assign = phone
    ? p.locator('[data-testid="plan-unassigned-assign-v140-a"], [data-testid="plan-unassigned-assign-v140-b"]').locator("visible=true")
    : p.getByRole("button", { name: "Назначить", exact: true }).locator("visible=true");
  await assign.first().waitFor();
  await h.shot("plan-day-accent");
  h.expect((await assign.count()) >= 2, `two visits nobody is on, each with «Назначить» (${await assign.count()})`);
  const yellow = await assign.evaluateAll((els, acc) => els.filter((el) => [el, ...el.querySelectorAll("*")].some((x) => getComputedStyle(x).backgroundColor === acc)).length, ACC);
  h.expect(yellow === 0, `«Назначить» is not yellow (${yellow} yellow)`);

  // it still works: the sheet of people opens
  await assign.first().click(); await p.waitForTimeout(400);
  await h.sheet().getByText("Ivan Sokolov").first().waitFor({ timeout: 5000 });
  h.expect((await h.sheet().count()) > 0, "«Назначить» opens the sheet of people");
};
