const { atMinute, todayKey } = require("../companyTime.cjs");
/**
 * Wave 7б-1 (docs/specs/03 §12): «Показывать выполненные» is a personal setting (db.prefs ↔ member_prefs), not a key of the
 * device. Chosen in the Plan → «Мои настройки → План» shows the same and keeps it after a reload; changed in the settings →
 * the Plan follows. The device's old value (octo.planShowDone.v1) moves into the setting once and the key is cleared.
 * Our own done task today at noon — no reliance on the demo.
 */
const { expectOneAccent } = require("../accent.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const task = { id: "t69", subjectType: "job", subjectId: "j1", title: "T69 order the gutters", startsAt: atMinute(todayKey(), 12 * 60), endsAt: atMinute(todayKey(), 12 * 60 + 30), doneAt: new Date().toISOString() };
  await p.evaluate((t) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    t.assigneeId = raw.db.me;
    raw.db.tasks = [...(raw.db.tasks || []).filter((x) => x.id !== t.id), t];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("feed"));
  }, task);
  const chip = (name) => p.getByRole("radio", { name, exact: true }).last();
  // ChoiceChips does not expose «selected» to the web's accessibility tree (reported): read the chip's frame instead (the chosen one has the ink frame)
  const frame = (name) => chip(name).evaluate((e) => { const s = getComputedStyle(e.firstElementChild); return `${s.borderTopColor} ${s.borderTopWidth}`; });

  // the Plan: hidden by default; «Показывать выполненные» shows it and saves the personal setting
  await h.go("/plan");
  h.expect(!/T69 order the gutters/.test(await h.text()), "a done task hides by default");
  await chip("Показывать выполненные").click(); await p.waitForTimeout(400);
  await h.expectText(/T69 order the gutters/, "«Показывать выполненные» shows it");
  let db = await h.db();
  h.expect(db.prefs && db.prefs.planShowDone === true, `the personal setting is saved: ${JSON.stringify(db.prefs)}`);
  h.expect(await p.evaluate(() => localStorage.getItem("octo.planShowDone.v1") === null || localStorage.getItem("octo.planShowDone.v1") === "null"), "not a key of the device");

  // «Мои настройки → План»: the same value, kept after a reload
  await h.go("/settings");
  await h.expectText(/План/, "the settings have the «План» section");
  await h.expectText(/одинакова на всех ваших устройствах/, "it says the setting follows the person");
  const [showFrame, hideFrame] = [await frame("Показывать выполненные"), await frame("Скрыть выполненные")];
  h.expect(showFrame !== hideFrame, "one of the two chips is chosen");
  await expectOneAccent(h, "«Мои настройки» with the Plan section");
  await h.shot("settings-plan");
  await chip("Скрыть выполненные").click(); await p.waitForTimeout(400);
  // the frames swap: so «Показывать выполненные» was the chosen one when the settings opened
  h.expect((await frame("Скрыть выполненные")) === showFrame && (await frame("Показывать выполненные")) === hideFrame, "«Мои настройки» opened with «Показывать выполненные» chosen");
  db = await h.db();
  h.expect(db.prefs.planShowDone === false, "hidden from the settings");
  await h.go("/plan");
  h.expect(!/T69 order the gutters/.test(await h.text()), "the Plan follows the settings: hidden");
  h.expect((await frame("Скрыть выполненные")) === showFrame, "the Plan's chips show «Скрыть выполненные» chosen");

  // the device's old «show» moves into the personal setting once, then the key is cleared
  await p.evaluate(() => localStorage.setItem("octo.planShowDone.v1", "true"));
  await h.go("/plan");
  await h.expectText(/T69 order the gutters/, "the old device value «show» moved: shown");
  db = await h.db();
  h.expect(db.prefs.planShowDone === true, "the old device value is now the personal setting");
  await p.waitForTimeout(400);
  h.expect(await p.evaluate(() => localStorage.getItem("octo.planShowDone.v1")) === "null", "the device key is cleared after the move");
  await chip("Скрыть выполненные").click(); await p.waitForTimeout(400);
  await h.go("/plan");
  h.expect(!/T69 order the gutters/.test(await h.text()), "once moved, the old key does not come back");
};
