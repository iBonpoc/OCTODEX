/**
 * e2e 523 — правка сохранённой сметы: «Готово / Отменить» и черновик на телефоне (#2381, К1; спецификация
 * notes/review-v2/k1-2381-stage0.md §4, §10–11; founder 21.11: «закрылось приложение — всё сохранено в телефоне», «Отменить —
 * с подтверждением», «Отменить видно только когда есть правки», «поменяли на другом телефоне — дать выбрать»). Every view, by testID:
 * - a saved estimate opened: no «Отменить», no «несохранённые правки»; an edit → the draft `edit|<id>` on the phone (with its base),
 *   «Отменить» beside «Готово», the line «Есть несохранённые правки»;
 * - a reload (the app closed by chance): the edit is still there;
 * - «Отменить» asks in the window in the middle (DS Б3): «Продолжить правку» keeps it; «Отменить изменения» — the estimate as saved;
 * - «×» with edits asks: «Отменить изменения» drops them; «Готово» saves them (the store's estimate changes, the draft goes);
 * - another phone saved it meanwhile: at the opening «Смету изменили на другом устройстве» — «Их версию» drops the edits;
 * - signed meanwhile: at the opening «Смета уже подписана» — «Оставить черновик» keeps it; «Готово» then does not erase it and never
 *   says «Сохранено»; «Сбросить правки» drops it.
 */
const DB = "octo.db.v5";
const DRAFTS = "octo.drafts.v1.demo";

exports.run = async (h) => {
  const p = h.page;
  const ID = "e6";
  const EDIT = `/estimate/new?id=${ID}`;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (id) => p.getByTestId(id).locator("visible=true").count();
  const titleInput = () => tid("ue-title").locator("input, textarea").first();
  const drafts = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), DRAFTS);
  const saved = () => p.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).db.estimates.find((e) => e.id === id), [DB, ID]);
  const patchSaved = (patch) => p.evaluate(([k, id, patch]) => {
    const st = JSON.parse(localStorage.getItem(k));
    st.db.estimates = st.db.estimates.map((e) => (e.id === id ? { ...e, ...patch } : e));
    localStorage.setItem(k, JSON.stringify(st));
  }, [DB, ID, patch]);
  const hasEditDraft = async () => (await drafts()).some((d) => d.ctx === `edit|${ID}`);
  const waitDraft = (want) => p.waitForFunction(([k, ctx, want]) => JSON.parse(localStorage.getItem(k) || "[]").some((d) => d.ctx === ctx) === want, [DRAFTS, `edit|${ID}`, want], { timeout: 5000 });
  const open = async () => {
    await h.go(EDIT);
    await tid("ue-title").waitFor({ timeout: 8000 });
  };
  const edit = async (text) => {
    await titleInput().fill(text);
    await waitDraft(true);
  };
  const dialog = (id) => tid(id).waitFor({ timeout: 5000 });

  await h.go("/today");
  const original = (await saved()).title;

  // opened: nothing to take back
  await open();
  h.expect((await count("k1-cancel")) === 0 && (await count("k1-unsaved")) === 0, "a saved estimate, untouched: no «Отменить», no «несохранённые правки»");
  h.expect(!(await hasEditDraft()), "untouched: no draft");

  // Р1: «Готово» with no edits only closes — nothing written, «sent» and its time untouched (red before: it saved and made it a draft)
  const before = await saved();
  await tid("ue-save").click();
  await p.getByTestId("ue-title").waitFor({ state: "detached", timeout: 5000 });
  const after = await saved();
  h.expect(after.status === before.status && after.sentAt === before.sentAt && JSON.stringify(after.doc) === JSON.stringify(before.doc), `«Готово» without edits wrote nothing (${before.status}→${after.status})`);
  // Р6: an old estimate without its own mark (doc.savedAt), the server's updated_at moved (Estimate.savedAt) — no false conflict
  await patchSaved({ savedAt: "2026-11-21T09:00:00.000Z", doc: { ...before.doc, savedAt: undefined } });
  await open();
  await edit("Правка 523 · старая");
  await patchSaved({ savedAt: "2026-11-21T11:11:00.000Z" });
  await open();
  h.expect((await count("k1-open-conflict")) === 0, "an old estimate: the server's time moved — no conflict asked");
  await tid("k1-cancel").click();
  await dialog("k1-cancel-ask");
  await tid("k1-cancel-yes").getByRole("button").click();
  await waitDraft(false);
  await patchSaved({ doc: before.doc, savedAt: before.savedAt });
  await open();

  // an edit: kept on the phone with its base; «Отменить» beside «Готово»
  await edit("Правка 523");
  const d = (await drafts()).find((x) => x.ctx === `edit|${ID}`);
  h.expect(d && d.title === "Правка 523" && typeof d.baseSavedAt === "string", `the draft edit|e6 with its base (${JSON.stringify(d && { t: d.title, b: d.baseSavedAt })})`);
  await tid("k1-cancel").waitFor({ timeout: 3000 });
  await tid("k1-unsaved").waitFor({ timeout: 3000 });
  await h.shot("edited");

  // the app closed by chance: the edit is there
  await open();
  h.expect((await titleInput().inputValue()) === "Правка 523", "after a reload the edit is on the screen");
  h.expect((await saved()).title === original, "the store's estimate is not changed yet");

  // «Отменить»: asked in the window in the middle; «Продолжить правку» keeps; «Отменить изменения» takes back
  await tid("k1-cancel").click();
  await dialog("k1-cancel-ask");
  await h.shot("cancel-ask");
  await tid("k1-cancel-no").getByRole("button").click();
  await p.getByTestId("k1-cancel-ask").waitFor({ state: "detached", timeout: 3000 });
  h.expect((await titleInput().inputValue()) === "Правка 523" && (await hasEditDraft()), "«Продолжить правку»: the edit stays");
  await tid("k1-cancel").click();
  await dialog("k1-cancel-ask");
  await tid("k1-cancel-yes").getByRole("button").click();
  await waitDraft(false);
  await open();
  h.expect((await titleInput().inputValue()) === original, "«Отменить изменения»: the estimate as saved");

  const phone = h.layout.width < 820;
  {
    // «×» with edits (a phone: the header's «×»; from 820 the same question on Esc — the way up): «Отменить изменения» drops them
    await edit("Правка 523 · ×");
    if (phone) await tid("hdr-close").click();
    else await require("../sheet.cjs").escOnPage(p);
    await dialog("k1-close-ask");
    await tid("k1-close-drop").getByRole("button").click();
    await waitDraft(false);
    h.expect((await saved()).title === original, "«×» → «Отменить изменения»: nothing saved");
    await open();
  }
  // saved: a phone by «×» → «Готово», from 820 by the column's «Готово» (the trail leaves without asking — the draft stays)
  await edit("Правка 523 · сохранено");
  if (phone) {
    await tid("hdr-close").click();
    await dialog("k1-close-ask");
    await tid("k1-close-save").getByRole("button").click();
  } else await tid("ue-save").click();
  await p.waitForFunction(([k, id]) => JSON.parse(localStorage.getItem(k)).db.estimates.find((e) => e.id === id)?.title === "Правка 523 · сохранено", [DB, ID], { timeout: 8000 });
  await waitDraft(false);

  // (Р4 «Назад» ≠ «мои» at «Готово» — the unit test editSession «takeMine»: the store reads another phone's change only at a load)
  // another phone saved it meanwhile: asked at the opening; «Их версию» drops the edits
  await open();
  await edit("Правка 523 · конфликт");
  await patchSaved({ title: "С другого телефона", savedAt: "2026-11-21T10:50:00.000Z", doc: { ...(await saved()).doc, savedAt: "2026-11-21T10:50:00.000Z" } });
  await open();
  await dialog("k1-open-conflict");
  await h.shot("conflict");
  await tid("k1-open-theirs").getByRole("button").click();
  await waitDraft(false);
  h.expect((await titleInput().inputValue()) === "С другого телефона", "«Их версию»: the other phone's estimate on the screen");

  // signed meanwhile: asked at the opening; «Оставить черновик» keeps it; «Готово» then neither erases it nor says «Сохранено»
  await edit("Правка 523 · подписана");
  await patchSaved({ status: "approved" });
  await open();
  await dialog("k1-open-signed");
  await h.shot("signed");
  await tid("k1-open-keep").getByRole("button").click();
  h.expect(await hasEditDraft(), "«Оставить черновик»: the edits stay on the phone");
  // Р2: the screen shows the estimate AS SAVED (signed), the line says the edits are aside (red before: the draft's lines were drawn)
  await tid("k1-kept").waitFor({ timeout: 3000 });
  h.expect((await titleInput().inputValue()) === "С другого телефона", "«Оставить»: the signed estimate as saved on the screen");
  const toastNow = async () => (await p.getByTestId("toast-text").locator("visible=true").allInnerTexts()).join(" | ");
  if (await count("ue-save")) {
    await tid("ue-save").click();
    if (await count("k1-signed-ask")) await tid("k1-signed-keep").getByRole("button").click();
  }
  h.expect(await hasEditDraft(), "«Готово» on a signed estimate: the draft is not erased");
  h.expect(!/Сохранено|сохранена/i.test(await toastNow()), `never «Сохранено» on a signed estimate (${await toastNow()})`);
  h.expect((await saved()).title === "С другого телефона", "the signed estimate is not changed");
  await open();
  await dialog("k1-open-signed");
  await tid("k1-open-reset").getByRole("button").click();
  await waitDraft(false);

  // Ж1 / Р3: the estimate deleted on another phone — the edits stay; asked (never made again with the same id)
  await patchSaved({ status: "sent" });
  await open();
  await edit("Правка 523 · удалена");
  await p.evaluate(([k, id]) => {
    const st = JSON.parse(localStorage.getItem(k));
    st.db.estimates = st.db.estimates.filter((e) => e.id !== id);
    localStorage.setItem(k, JSON.stringify(st));
  }, [DB, ID]);
  await open();
  await dialog("k1-missing-ask");
  await h.shot("missing");
  await tid("k1-missing-reset").getByRole("button").click();
  await waitDraft(false);
  h.expect(!(await p.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).db.estimates.some((e) => e.id === id), [DB, ID])), "the deleted estimate is not made again");

  // Ж2: the phone refuses to keep the edits (full storage) — said, with the way out
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("ue-title").waitFor({ timeout: 8000 });
  await p.evaluate((k) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, v) {
      if (key === k) throw new DOMException("full", "QuotaExceededError");
      return set.call(this, key, v);
    };
  }, DRAFTS);
  await titleInput().fill("Не пишется");
  await tid("k1-write-failed").waitFor({ timeout: 5000 });
};
