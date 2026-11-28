/**
 * e2e 399 — #1558 (spec 46 §5.3а): a photo that cannot be made anew here is never sent as picked. The web build's
 * decoder is switched off (window.__e2ePhotoDecodeFail): the photo picked with «＋ → Фото» stays on the visit with
 * «Готовится» (an info note, not «не загрузились»), no «Повторить», its reason says it goes on its own. The phone
 * tries again by itself (the page's clock moved on); 5 rounds and a day — «не открывается» with «Подготовить снова»;
 * the decoder back — that tap makes the file anew and the mark goes (a new file, not the picked one). A receipt that
 * cannot be made anew is not lost: the expense is saved with it «preparing» and its card says «Готовится».
 * Every view. Waits on what it checks; ids by testID.
 */
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");
const { visitStep, visitCameraAdd } = require("../visitScreen.cjs");

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const MIN = 60 * 1000;

exports.run = async (h) => {
  const says = async (loc) => `${await loc.innerText()} ${(await loc.locator('[data-testid="row-status-icon"]').first().getAttribute("aria-label", { timeout: 1000 }).catch(() => null)) ?? ""}`; // #3033: the status icon has no word — its words are its label
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  /** the visit's only photo as the phone keeps it */
  const photoIn = (visitId) =>
    p.evaluate((v) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits?.find((x) => x.id === v)?.photos?.[0] ?? null, visitId);
  const waitPhoto = (visitId, test, what) =>
    p
      .waitForFunction(
        ([v, src]) => {
          const ph = JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits?.find((x) => x.id === v)?.photos?.[0];
          return !!ph && new Function("ph", `return (${src})(ph)`)(ph);
        },
        [visitId, test.toString()],
        { timeout: 10000 },
      )
      .catch(() => h.expect(false, what));

  // ---- a receipt: not made anew — the expense keeps it «preparing», not lost
  await h.go("/expense/new");
  const rcpt = vis("expense-photo");
  await rcpt.waitFor({ timeout: 8000 });
  await p.evaluate(() => (window.__e2ePhotoDecodeFail = true));
  const [ch2] = await Promise.all([p.waitForEvent("filechooser"), rcpt.click()]);
  await ch2.setFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await p.locator('img[src^="blob:"]').first().waitFor({ timeout: 8000 });
  await p.getByTestId("field-amount").locator("input").locator("visible=true").first().fill("39.91");
  await vis("expense-save").click();
  await p
    .waitForFunction(
      () => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.expenses ?? []).some((y) => y.amountCents === 3991 && y.receiptFailed === "preparing" && y.receiptUri && y.receiptFileId),
      null,
      { timeout: 8000 },
    )
    .catch(() => h.expect(false, "the expense is saved with its receipt «preparing» (kept here, its row for the cloud)"));
  await h.go("/money");
  const card = p.locator('[data-testid^="expense-row-"]').locator("visible=true").filter({ hasText: "$40" }).first(); // #3029: a list row shows whole dollars ($39.91 → $40)
  await card.waitFor({ timeout: 8000 });
  h.expect(/Готовится/.test(await says(card)) && !/Без чека/.test(await says(card)), "the card: «Готовится», not «Без чека»");

  // ---- a visit's photo
  await h.go("/today");
  await h.seed("octo.role.v1", "tech");
  const db = await h.db();
  const v0 = db.visits.find((v) => v.techId === db.me && v.step === "scheduled" && !v.photos.length);
  h.expect(!!v0, "a visit of mine without photos");
  await h.go(`/visit/${v0.id}`);
  await visitStep(p, "en-route");
  await visitStep(p, "on-site");

  // ---- the decoder is off: «＋ → Фото» (the visit's camera sheet, v2) keeps the photo here, «Готовится»
  await p.evaluate(() => (window.__e2ePhotoDecodeFail = true));
  const [chooser] = await visitCameraAdd(p);
  await chooser.setFiles({ name: "with-gps.png", mimeType: "image/png", buffer: PNG });
  await waitPhoto(v0.id, (ph) => ph.upload?.failed === "preparing" && ph.prep?.length === 1, "the photo is kept as «preparing» with its first round");
  const picked = (await photoIn(v0.id)).uri;
  h.expect(picked?.startsWith("blob:"), "the picked file stays on this phone only (its tile)");
  await p.waitForFunction(() => /Фото готовится — уйдёт само/.test(document.body.innerText), null, { timeout: 8000 });
  // the camera sheet closed: the visit's own strip shows it (the sheet's strip is the same strip)
  await pressEscUntilClosed(p);

  await vis("photo-prep-strip").waitFor({ timeout: 8000 });
  h.expect((await vis("photo-prep-strip").innerText()).includes("Готовятся к отправке: 1 — уйдут сами"), "the strip: how many, and that they go on their own");
  h.expect((await p.getByTestId("photo-upload-failed").locator("visible=true").count()) === 0, "not «не загрузились»");
  await h.shot("preparing");
  await vis(`photo-thumb-${(await photoIn(v0.id)).id}`).click();
  const reason = h.sheet().getByTestId("photo-prep-reason");
  await reason.waitFor({ timeout: 5000 });
  h.expect((await reason.innerText()).includes("уйдёт само"), "the viewer: what happens");
  h.expect((await h.sheet().getByTestId("photo-upload-retry").count()) === 0, "no «Повторить»: the phone tries by itself");
  h.expect((await h.sheet().getByTestId("photo-prep-again").count()) === 0, "no «Подготовить снова» while it is «preparing»");
  await pressEscUntilClosed(p);

  // ---- the phone tries again by itself: a round every 10 minutes, 5 rounds and a day → «unreadable»
  for (let n = 2; n <= 5; n++) {
    await p.clock.fastForward(11 * MIN);
    await waitPhoto(v0.id, new Function(`return (ph) => ph.prep?.length === ${n}`)(), `round ${n} by itself`);
  }
  h.expect((await photoIn(v0.id)).upload.failed === "preparing", "5 rounds within the day: still «preparing»");
  await p.clock.fastForward(25 * 60 * MIN);
  await waitPhoto(v0.id, (ph) => ph.upload?.failed === "unreadable", "5 rounds and a day: «unreadable»");
  h.expect((await photoIn(v0.id)).uri === picked, "the picked file is still only here, nothing replaced it");

  await vis(`photo-thumb-${(await photoIn(v0.id)).id}`).click();
  const unreadable = h.sheet().getByTestId("photo-prep-unreadable");
  await unreadable.waitFor({ timeout: 5000 });
  h.expect((await unreadable.innerText()).includes("сохраните как JPEG"), "what to do");
  await h.shot("unreadable");

  // ---- the decoder back: «Подготовить снова» makes the file anew, the mark goes
  await p.evaluate(() => (window.__e2ePhotoDecodeFail = false));
  await h.sheet().getByTestId("photo-prep-again").click();
  await sheetGone(p);
  await waitPhoto(v0.id, (ph) => !ph.upload && !ph.prep, "prepared: the mark and the log go");
  const made = (await photoIn(v0.id)).uri;
  h.expect(!!made && made !== picked, "a new file made here, not the picked one");
  await p.waitForFunction(() => !document.querySelector('[data-testid="photo-prep-strip"]')?.checkVisibility?.(), null, { timeout: 8000 });
};
