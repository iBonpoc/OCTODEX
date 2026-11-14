/**
 * e2e 382 — #1431: a photo the cloud did not take is told, with its reason, and «Повторить» sends it again where it can help.
 * The phone's data holds a visit on site with three refused photos — refused with the file here, too big with the file
 * here, refused on another phone (no file here) — and a signed visit with one refused photo. The strip says how many and
 * to tap a photo; the viewer says why in plain words and offers «Повторить» only for a plain refusal of a file on this phone
 * (a too big file would be refused again: «удалите и снимите заново»); a signed visit shows its refused photos too;
 * «Требует внимания» has one reason per visit with its date, «Повторить» where a photo can be sent, «Отменить» brings the
 * mark back. Every view. Waits on what it checks; ids by testID.
 */
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const AT = "2026-11-14T10:00:00Z";

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const markOf = (visitId, photoId) =>
    p.evaluate(([v, ph]) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits?.find((x) => x.id === v)?.photos?.find((x) => x.id === ph)?.upload?.failed ?? null, [visitId, photoId]);
  const waitMark = (visitId, photoId, want) =>
    p.waitForFunction(
      ([v, ph, w]) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits?.find((x) => x.id === v)?.photos?.find((x) => x.id === ph)?.upload?.failed ?? null) === w,
      [visitId, photoId, want],
      { timeout: 8000 },
    );
  const reasonOf = async (thumb) => {
    await vis(thumb).click();
    const reason = h.sheet().getByTestId("photo-upload-reason");
    await reason.waitFor({ timeout: 5000 });
    return reason.innerText();
  };
  const triageCount = (n) =>
    p.waitForFunction((re) => new RegExp(re).test(document.body.innerText), `фото не загрузились: ${n}`, { timeout: 10000 });

  await h.go("/triage");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const open = raw.db.visits.filter((x) => x.jobId && x.step === "scheduled");
  h.expect(open.length >= 2, "two scheduled job visits in the demo");
  const [v, w] = open;
  Object.assign(v, {
    step: "on_site",
    photos: [
      { id: "e382-here", kind: "before", uri: PNG, upload: { failed: "refused", at: AT } },
      { id: "e382-big", kind: "before", uri: PNG, upload: { failed: "tooBig", at: AT } },
      { id: "e382-far", kind: "before", upload: { failed: "refused", at: AT } },
    ],
  });
  Object.assign(w, { step: "signed", signature: "M0 0", photos: [{ id: "e382-done", kind: "after", uri: PNG, upload: { failed: "refused", at: AT } }] });
  await h.seed("octo.db.v5", raw);

  // ---- the visit on site: the strip says how many and what to do, the viewer says why
  await h.go(`/visit/${v.id}`);
  await vis("photo-upload-failed").waitFor({ timeout: 10000 });
  const note = await vis("photo-upload-failed").innerText();
  h.expect(note.includes("Не загрузились в облако: 3") && note.includes("нажмите на фото"), `the strip: how many, and to tap a photo (${note})`);
  h.expect((await vis("photo-upload-failed-icon").count()) === 1, "the status is an icon and words (rule 2)");
  h.expect(/не загрузилось/.test((await vis("photo-thumb-e382-far").getAttribute("aria-label")) ?? ""), "the thumbnail says it to a screen reader");
  await h.shot("strip");

  // refused on another phone: why, and that the file is there — nothing to send from here
  const far = await reasonOf("photo-thumb-e382-far");
  h.expect(far.includes("Облако не приняло фото.") && far.includes("Файл остался на телефоне, с которого снимали."), `another phone's photo: ${far}`);
  h.expect((await h.sheet().getByTestId("photo-upload-retry").count()) === 0, "no «Повторить» without the file");
  // the viewer's backdrop is labelled «Закрыть» too: Esc through the guarded helper
  await pressEscUntilClosed(p);

  // too big: the same file would be refused again — what to do instead, no «Повторить»
  const big = await reasonOf("photo-thumb-e382-big");
  h.expect(big.includes("Файл больше 25 МБ") && big.includes("снимите заново"), `too big: why and what to do (${big})`);
  h.expect((await h.sheet().getByTestId("photo-upload-retry").count()) === 0, "too big: no «Повторить» that would fail again");
  await pressEscUntilClosed(p);

  // refused, the file is here: «Повторить» sends it again
  h.expect((await reasonOf("photo-thumb-e382-here")).includes("Облако не приняло фото."), "a plain refusal");
  await h.shot("viewer");
  await h.sheet().getByTestId("photo-upload-retry").click();
  await sheetGone(p);
  await waitMark(v.id, "e382-here", null);
  await p.waitForFunction(() => /Не загрузились в облако: 2/.test(document.body.innerText), null, { timeout: 5000 });
  h.expect((await markOf(v.id, "e382-far")) === "refused" && (await markOf(v.id, "e382-big")) === "tooBig", "the other photos keep their marks");

  // ---- a signed visit: its refused photo is shown too (no strips on this step otherwise)
  await h.go(`/visit/${w.id}`);
  await vis("photo-upload-failed").waitFor({ timeout: 10000 });
  h.expect((await vis("photo-upload-failed").innerText()).includes("Не загрузились в облако: 1"), "a signed visit: the refused photo is there");
  h.expect(/Фото, которых нет в облаке/.test(await h.text()), "the card says what these photos are");
  h.expect((await vis("photo-add").count()) === 0, "no «Добавить фото» on a signed visit");

  // ---- «Требует внимания»: one reason per visit with its date; «Повторить» only where a photo can be sent
  await h.go("/triage");
  await triageCount(2);
  await triageCount(1);
  h.expect(/выезд [A-Z][a-z]{2} \d{1,2}: фото не загрузились/.test(await h.text()), "which visit: its date");
  h.expect(/Не загружено/.test(await h.text()), "the bad chip with its word");
  await h.shot("triage");
  const cards = p.getByTestId("list-card").filter({ hasText: "фото не загрузились" });
  const retry = cards.getByRole("button", { name: "Повторить", exact: true });
  h.expect((await retry.count()) === 1, `«Повторить» only on the signed visit's card (${await retry.count()})`);
  await retry.first().click();
  await waitMark(w.id, "e382-done", null);
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  await waitMark(w.id, "e382-done", "refused");
  await triageCount(1);
};
