/**
 * e2e 382 — #1431: a photo the cloud did not take is told, with its reason, and «Повторить» sends it again.
 * The phone's data holds a visit on site with two refused photos — one too big whose file is here, one refused on another
 * phone (no file here) — and a signed visit with a refused photo. The strip says «Не загрузилось в облако: N»; the viewer
 * says why in plain words and offers «Повторить» only where the file is; a signed visit shows its refused photos too;
 * «Требует внимания» has «фото не загрузились: N» per visit with «Повторить», and «Отменить» brings the mark back.
 * Every view. Waits on what it checks; ids by testID.
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

  await h.go("/triage");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const open = raw.db.visits.filter((x) => x.jobId && x.step === "scheduled");
  h.expect(open.length >= 2, "two scheduled job visits in the demo");
  const [v, w] = open;
  Object.assign(v, {
    step: "on_site",
    photos: [
      { id: "e382-big", kind: "before", uri: PNG, upload: { failed: "tooBig", at: AT } },
      { id: "e382-far", kind: "before", upload: { failed: "refused", at: AT } },
    ],
  });
  Object.assign(w, { step: "signed", signature: "M0 0", photos: [{ id: "e382-done", kind: "after", uri: PNG, upload: { failed: "type", at: AT } }] });
  await h.seed("octo.db.v5", raw);

  // ---- the visit on site: the strip says how many, the viewer says why
  await h.go(`/visit/${v.id}`);
  await vis("photo-upload-failed").waitFor({ timeout: 10000 });
  h.expect((await vis("photo-upload-failed").innerText()).includes("Не загрузилось в облако: 2"), "the strip: how many did not go");
  h.expect((await vis("photo-upload-failed-icon").count()) === 1, "the status is an icon and words (rule 2)");
  h.expect(/не загрузилось/.test((await vis("photo-thumb-e382-far").getAttribute("aria-label")) ?? ""), "the thumbnail says it to a screen reader");
  await h.shot("strip");

  // refused on another phone: why, and that the file is there — nothing to send from here
  await vis("photo-thumb-e382-far").click();
  await h.sheet().getByTestId("photo-upload-reason").waitFor({ timeout: 5000 });
  const far = await h.sheet().getByTestId("photo-upload-reason").innerText();
  h.expect(far.includes("Облако не приняло фото.") && far.includes("Файл остался на телефоне, с которого снимали."), `another phone's photo: ${far}`);
  h.expect((await h.sheet().getByTestId("photo-upload-retry").count()) === 0, "no «Повторить» without the file");
  // the viewer's backdrop is labelled «Закрыть» too: Esc through the guarded helper
  await pressEscUntilClosed(p);

  // too big, the file is here: the reason and «Повторить»
  await vis("photo-thumb-e382-big").click();
  await h.sheet().getByTestId("photo-upload-reason").waitFor({ timeout: 5000 });
  h.expect((await h.sheet().getByTestId("photo-upload-reason").innerText()).includes("Файл больше 25 МБ"), "the reason in plain words");
  await h.shot("viewer");
  await h.sheet().getByTestId("photo-upload-retry").click();
  await sheetGone(p);
  await waitMark(v.id, "e382-big", null);
  await p.waitForFunction(() => /Не загрузилось в облако: 1/.test(document.body.innerText), null, { timeout: 5000 });
  h.expect((await markOf(v.id, "e382-far")) === "refused", "the other photo keeps its mark");

  // ---- a signed visit: its refused photo is shown too (no strips on this step otherwise)
  await h.go(`/visit/${w.id}`);
  await vis("photo-upload-failed").waitFor({ timeout: 10000 });
  h.expect((await vis("photo-upload-failed").innerText()).includes("Не загрузилось в облако: 1"), "a signed visit: the refused photo is there");
  h.expect((await vis("photo-add").count()) === 0, "no «Добавить фото» on a signed visit");

  // ---- «Требует внимания»: one reason per visit, «Повторить» where the file is here, «Отменить» brings the mark back
  await h.go("/triage");
  await p.waitForFunction(() => (document.body.innerText.match(/фото не загрузились: 1/g) ?? []).length >= 2, null, { timeout: 10000 });
  h.expect(/Не загружено/.test(await h.text()), "the bad chip with its word");
  await h.shot("triage");
  const card = p.getByTestId("list-card").filter({ hasText: "фото не загрузились" });
  // the visit whose only refused photo is another phone's: no «Повторить»; the signed one: «Повторить»
  const retry = card.getByRole("button", { name: "Повторить", exact: true });
  h.expect((await retry.count()) === 1, `«Повторить» only where the file is here (${await retry.count()})`);
  await retry.first().click();
  await waitMark(w.id, "e382-done", null);
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  await waitMark(w.id, "e382-done", "type");
  await p.waitForFunction(() => (document.body.innerText.match(/фото не загрузились: 1/g) ?? []).length >= 2, null, { timeout: 8000 });
};
