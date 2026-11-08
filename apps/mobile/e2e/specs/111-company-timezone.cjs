/**
 * companies.timezone (docs/specs/22 §1, «Каркас» №7). «Ещё → Компания → Расписание»:
 * - a stored zone that is not one of the 7 US chips (America/Puerto_Rico) is offered as its own chip (before: no chip
 *   was chosen and the zone could not be kept by choosing it again); saving other settings keeps it;
 * - a stored zone this phone does not know: «Пояс не распознан» (warn chip + words), the times follow Los Angeles;
 *   choosing a zone fixes it.
 */
const setZone = (h, tz) => h.page.evaluate((tz) => {
  const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
  raw.db.company = { ...raw.db.company, timezone: tz };
  localStorage.setItem("octo.db.v5", JSON.stringify(raw));
}, tz);

exports.run = async (h) => {
  const p = h.page;
  await h.go("/company");
  await setZone(h, "America/Puerto_Rico");
  await h.go("/company/schedule");
  await h.expectText(/Рабочие часы/, "the schedule screen opened");
  h.expect(await p.getByRole("radio", { name: "Puerto Rico" }).count() === 1, "the stored zone is a chip of its own");
  h.expect(await p.getByTestId("tz-unknown").count() === 0, "a known zone: no warning");
  await h.click("«Опаздывает» через +5");
  await h.click("Сохранить");
  let db = await h.db();
  h.expect(db.company.timezone === "America/Puerto_Rico", `saving the schedule keeps the zone: ${db.company.timezone}`);

  await setZone(h, "Bad/Zone");
  await h.go("/company/schedule");
  await h.expectText(/Пояс не распознан/, "an unknown zone: the warn chip");
  await h.expectText(/Телефон не знает пояс «Bad\/Zone»/, "and what it means");
  h.expect(await p.getByRole("radio", { name: "Zone" }).count() === 0, "an unknown zone is not offered as a chip");
  await h.shot("unknown");
  await p.getByRole("radio", { name: "Chicago" }).click();
  await h.click("Сохранить");
  // the save lands in the store a moment after the tap: wait for it, not one read (CHECKS §9)
  db = await h.db();
  for (let i = 0; i < 30 && db.company.timezone !== "America/Chicago"; i++) { await p.waitForTimeout(200); db = await h.db(); }
  h.expect(db.company.timezone === "America/Chicago", `a chosen zone fixes it: ${db.company.timezone}`);
  await h.go("/company/schedule");
  h.expect(await p.getByTestId("tz-unknown").count() === 0, "no warning after the fix");
};
