/**
 * e2e 523 — правка сохранённой сметы: «Готово / Отменить» и черновик на телефоне (#2381, К1; спецификация
 * notes/review-v2/k1-2381-stage0.md §4, §10–11; founder 21.11: «закрылось приложение — всё сохранено в телефоне», «Отменить —
 * с подтверждением», «Отменить видно только когда есть правки», «поменяли на другом телефоне — дать выбрать»). Every view, by testID:
 * - a saved estimate opened: no «Отменить», no «несохранённые правки»; an edit → the draft `edit|<id>` on the phone (with its base),
 *   «Отменить» — the last item of «⋯» (#2935: the bar holds «Итого · Готово · Отправить»), the line «Правки с момента открытия» with
 *   its «?» (#2423);
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
  // #2935: «Отменить» (only with edits) is an item of the header's «⋯» — the bar holds «Итого · Готово · Отправить»
  const line = require("../estimateLine.cjs");
  const pressCancel = () => line.editorMenu(h, "k1-cancel");
  const hasCancel = () => line.editorMenuHas(h, "k1-cancel");
  const titleInput = () => tid("ue-title").locator("input, textarea").first();
  const drafts = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k) || "[]"), DRAFTS);
  const saved = () => p.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).db.estimates.find((e) => e.id === id), [DB, ID]);
  // the store's copy changed as another phone would (read now, put back on a page without the app — h.seed, CHECKS §9 №12)
  const rawDb = () => p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB);
  const patchSaved = async (patch) => {
    const st = await rawDb();
    st.db.estimates = st.db.estimates.map((e) => (e.id === ID ? { ...e, ...patch } : e));
    await h.seed(DB, st);
  };
  // what the store holds once the app has written it out: leaving the page writes at once (the store writes ~250 ms after a change)
  const flushedSaved = async () => {
    await h.go("/today");
    await p.getByTestId("ue-title").waitFor({ state: "detached", timeout: 5000 });
    return saved();
  };
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
  const e6orig = await saved();
  /** e6 back as it was (status / changes set over it), and this edit put on the phone as a draft — through h.seed */
  const restore = async (patch = {}) => {
    const st = await rawDb();
    st.db.estimates = [...st.db.estimates.filter((e) => e.id !== ID), { ...e6orig, ...patch }];
    await h.seed(DB, st);
  };
  const seedEdit = async (title, extra = {}) => {
    await h.seed(DRAFTS, [{ ctx: `edit|${ID}`, at: new Date().toISOString(), estimateId: ID, customerId: e6orig.customerId, propertyId: e6orig.propertyId, title, doc: e6orig.doc, checkPrice: [], baseSavedAt: "", ...extra }]);
  };

  // opened: nothing to take back
  await open();
  h.expect(!(await hasCancel()) && (await count("k1-unsaved")) === 0, "a saved estimate, untouched: no «Отменить», no «несохранённые правки»");
  h.expect(!(await hasEditDraft()), "untouched: no draft");

  // Р1: «Готово» with no edits only closes — nothing written, «sent» and its time untouched (red before: it saved and made it a draft)
  const before = await saved();
  await tid("ue-save").click();
  await p.getByTestId("ue-title").waitFor({ state: "detached", timeout: 5000 });
  const after = await flushedSaved();
  h.expect(after.status === before.status && after.sentAt === before.sentAt && JSON.stringify(after.doc) === JSON.stringify(before.doc), `«Готово» without edits wrote nothing (${before.status}→${after.status})`);
  // №23: the client became tax exempt since the estimate was SENT; it is opened only to look — «Готово» closes, nothing written:
  // the client's sum never changes from a look, «sent» stays (red before: it re-saved without tax and made it a draft)
  {
    const st = await rawDb();
    const cid = st.db.estimates.find((e) => e.id === ID).customerId;
    // (the estimate with its tax on the whole amount, as sent; then the client is made exempt)
    st.db.estimates = st.db.estimates.map((e) => (e.id === ID ? { ...e, status: "sent", doc: { ...e.doc, settings: { ...e.doc.settings, tax: { ...e.doc.settings.tax, enabled: true } } } } : e));
    st.db.customers = st.db.customers.map((c) => (c.id === cid ? { ...c, taxExempt: true } : c));
    await h.seed(DB, st);
    await open();
    const b2 = await saved();
    await tid("ue-save").click();
    await p.getByTestId("ue-title").waitFor({ state: "detached", timeout: 5000 });
    const a2 = await flushedSaved();
    h.expect(a2.status === b2.status && JSON.stringify(a2.doc) === JSON.stringify(b2.doc), `a sent estimate of a now-exempt client, only looked at: nothing written (${b2.status}→${a2.status}, tax ${b2.doc.settings.tax.enabled}→${a2.doc.settings.tax.enabled})`);
    const st2 = await rawDb();
    st2.db.customers = st2.db.customers.map((c) => (c.id === cid ? { ...c, taxExempt: false } : c));
    await h.seed(DB, st2);
  }
  // Р6: an old estimate without its own mark (doc.savedAt), the server's updated_at moved (Estimate.savedAt) — no false conflict
  await patchSaved({ savedAt: "2026-11-21T09:00:00.000Z", doc: { ...before.doc, savedAt: undefined } });
  await open();
  await edit("Правка 523 · старая");
  await patchSaved({ savedAt: "2026-11-21T11:11:00.000Z" });
  await open();
  h.expect((await count("k1-open-conflict")) === 0, "an old estimate: the server's time moved — no conflict asked");
  await pressCancel();
  await dialog("k1-cancel-ask");
  await tid("k1-cancel-yes").getByRole("button").click();
  await waitDraft(false);
  await patchSaved({ doc: before.doc, savedAt: before.savedAt });
  await open();

  // an edit: kept on the phone with its base; «Отменить» in «⋯»
  await edit("Правка 523");
  const d = (await drafts()).find((x) => x.ctx === `edit|${ID}`);
  h.expect(d && d.title === "Правка 523" && typeof d.baseSavedAt === "string", `the draft edit|e6 with its base (${JSON.stringify(d && { t: d.title, b: d.baseSavedAt })})`);
  await tid("k1-unsaved").waitFor({ timeout: 3000 });
  h.expect(await hasCancel(), "with edits: «Отменить» is in «⋯»");
  // #2423 (founder 23.11: «несохранённые правки — что это значит?»): the line says «Правки с момента открытия», «?» explains it
  h.expect(/Правки с момента открытия/.test(await tid("k1-unsaved").innerText()), "the line: «Правки с момента открытия»");
  await tid("k1-unsaved-help").click();
  await h.sheet().getByText(/уже хранится на телефоне/).waitFor({ timeout: 3000 });
  h.expect(/«Готово» принимает правки/.test(await h.sheet().innerText()), "«?» explains «Готово» and «Отменить»");
  await require("../sheet.cjs").pressEscUntilClosed(p);
  await require("../sheet.cjs").sheetGone(p);
  await h.shot("edited");

  // the app closed by chance: the edit is there
  await open();
  h.expect((await titleInput().inputValue()) === "Правка 523", "after a reload the edit is on the screen");
  h.expect((await saved()).title === original, "the store's estimate is not changed yet");

  // «Отменить»: asked in the window in the middle; «Продолжить правку» keeps; «Отменить изменения» takes back
  await pressCancel();
  await dialog("k1-cancel-ask");
  await h.shot("cancel-ask");
  await tid("k1-cancel-no").getByRole("button").click();
  await p.getByTestId("k1-cancel-ask").waitFor({ state: "detached", timeout: 3000 });
  h.expect((await titleInput().inputValue()) === "Правка 523" && (await hasEditDraft()), "«Продолжить правку»: the edit stays");
  await pressCancel();
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
    else {
      // Esc in a field is not «leave the screen» (Screen's rule): out of the field first, then Esc — the way up
      await p.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
      // #2774: the Esc that asks is let go only once the question is up — its keyup must not close it (react-native-web's Modal
      // closes on an Escape keyup; under load the window mounted between the down and the up of one press and was gone at once)
      await require("../sheet.cjs").sheetGone(p);
      await p.keyboard.down("Escape");
      await dialog("k1-close-ask");
      await p.keyboard.up("Escape");
      const gone = await require("../sheet.cjs").waited(p.getByTestId("k1-close-ask").waitFor({ state: "detached", timeout: 1000 }));
      h.expect(!gone, "the Esc that asked does not close its own question when let go");
      // an Esc pressed while the question is up is still its way back («Продолжить правку»): the edit stays; then asked again
      await require("../sheet.cjs").pressEscUntilClosed(p, undefined, { tries: 1 });
      h.expect((await titleInput().inputValue()) === "Правка 523 · ×" && (await hasEditDraft()), "Esc on the question: the way back, the edit stays");
      await require("../sheet.cjs").escOnPage(p);
    }
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
  {
    const st = await rawDb();
    st.db.estimates = st.db.estimates.filter((e) => e.id !== ID);
    await h.seed(DB, st);
  }
  // the store loaded with the estimate gone (another phone deleted it, or this role cannot see it): the edit stays on the phone
  await h.go("/today");
  await h.go("/estimates");
  h.expect(await hasEditDraft(), "the estimate gone from the loaded store: its edit is not dropped (rule 5)");
  await open();
  await dialog("k1-missing-ask");
  await h.shot("missing");
  await tid("k1-missing-reset").getByRole("button").click();
  await waitDraft(false);
  h.expect(!(await p.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).db.estimates.some((e) => e.id === id), [DB, ID])), "the deleted estimate is not made again");

  // ── review 3 ──
  // Б-1: signed, the edit carries «проверить цену» and «в каталог»: «Оставить черновик» keeps the EDIT on the phone (red before:
  // the screen's leftovers differed from the snapshot and the draft was overwritten with the signed estimate)
  const firstLine = e6orig.doc.options[0].lines[0].id;
  await restore({ status: "approved" });
  await seedEdit("Правка 523 · Б-1", { checkPrice: [firstLine], wantCatalog: [firstLine] });
  await open();
  await dialog("k1-open-signed");
  await tid("k1-open-keep").getByRole("button").click();
  await tid("k1-kept").waitFor({ timeout: 3000 });
  await titleInput().fill(await titleInput().inputValue()); // a render after the keep
  await h.go("/today");
  h.expect((await drafts()).some((d) => d.ctx === `edit|${ID}` && d.title === "Правка 523 · Б-1"), "«Оставить черновик»: the edit itself stays on the phone (not the signed estimate)");

  // Б-2: «Сбросить правки» of a kept estimate asks first (rule 5): «Назад» keeps, «Сбросить» drops
  await open();
  await dialog("k1-open-signed");
  await tid("k1-open-keep").getByRole("button").click();
  await tid("k1-kept-reset").getByRole("button").click();
  await dialog("k1-kept-reset-ask");
  await tid("k1-kept-reset-no").getByRole("button").click();
  h.expect(await hasEditDraft(), "«Назад»: the edit stays");
  await tid("k1-kept-reset").getByRole("button").click();
  await dialog("k1-kept-reset-ask");
  await tid("k1-kept-reset-yes").getByRole("button").click();
  await waitDraft(false);

  // «Сделать копию с правками»: a NEW estimate (same client and property, no lead), the draft goes (§11 п.2)
  await restore({ status: "approved", leadId: e6orig.leadId ?? "l1" });
  await seedEdit("Правка 523 · копия", { doc: { ...e6orig.doc, terms: "SIGNED TERMS 523" } });
  await open();
  await dialog("k1-open-signed");
  await tid("k1-open-copy").getByRole("button").click();
  await waitDraft(false);
  // the toast's «Отменить»: the copy goes out, the edit comes back to the phone
  await p.getByTestId("toast").filter({ hasText: /Копия/ }).locator('[data-testid="toast-undo"][aria-busy="false"]').first().click();
  await waitDraft(true);
  h.expect(!(await flushedSaved() && (await rawDb()).db.estimates.some((e) => e.id !== ID && e.title === "Правка 523 · копия")), "«Отменить» of the copy: no copy left");
  // again — the copy stays this time
  await open();
  await dialog("k1-open-signed");
  await tid("k1-open-copy").getByRole("button").click();
  await waitDraft(false);
  await flushedSaved();
  {
    const copy = (await rawDb()).db.estimates.find((e) => e.id !== ID && e.title === "Правка 523 · копия");
    h.expect(!!copy && copy.customerId === e6orig.customerId && copy.propertyId === e6orig.propertyId && !copy.leadId && copy.status === "draft", `the copy: same client and property, no lead, a draft (${JSON.stringify(copy && { c: copy.customerId, l: copy.leadId, s: copy.status })})`);
    h.expect((await saved()).status === "approved" && (await saved()).title === e6orig.title, "the signed estimate is not changed");
    // Р8: the copy is a new estimate — the company's Terms, not the signed one's
    h.expect(typeof copy.doc.terms === "string" && copy.doc.terms !== "SIGNED TERMS 523", `the copy's Terms are a new estimate's (${String(copy.doc.terms).slice(0, 40)})`);
  }

  // §10: the client signed (awaiting_countersign) — «Сохранить и снять подпись» saves, asked ONCE (red before: asked again at the save)
  await restore({ status: "awaiting_countersign" });
  await seedEdit("Правка 523 · снять подпись");
  await open();
  await dialog("k1-open-signed");
  await tid("k1-open-unsign").getByRole("button").click();
  await waitDraft(false);
  h.expect((await count("k1-await-ask")) === 0, "«Сохранить и снять подпись» is not asked a second time");
  {
    const a = await flushedSaved();
    h.expect(a.title === "Правка 523 · снять подпись" && a.status === "draft", `saved, the signature off (${a.status})`);
  }

  // §10: a double press — «Готово» saves once, «Отменить» asks once
  await restore();
  await open();
  await edit("Правка 523 · двойное");
  // (#2935: the item of «⋯» — two presses in one tick, before the menu has gone)
  await p.getByTestId("est-menu").locator("visible=true").first().getByRole("button").first().click();
  await tid("k1-cancel").evaluate((el) => { el.click(); el.click(); });
  await dialog("k1-cancel-ask");
  h.expect((await p.getByTestId("k1-cancel-ask").locator("visible=true").count()) === 1, "«Отменить» pressed twice: one question on the screen");
  await tid("k1-cancel-no").getByRole("button").click();
  // «Отменить» twice then «Отменить изменения»: ONE way back — to the estimate it was opened from, never past it (a check that fails
  // if the way back runs twice); the editor opened in the app (its own history), from the estimate's «Изменить»
  await h.go(`/estimate/${ID}`);
  // «Изменить» lives in «⋯» (#2997: the icon row is the person's — Позвонить · SMS · Почта · PDF)
  await tid("estimate-screen-more").getByRole("button").first().click();
  await tid("est-act-edit").click();
  await tid("ue-title").waitFor({ timeout: 8000 });
  await titleInput().fill("Правка 523 · дважды");
  await waitDraft(true);
  await p.getByTestId("est-menu").locator("visible=true").first().getByRole("button").first().click();
  await tid("k1-cancel").evaluate((el) => { el.click(); el.click(); });
  await dialog("k1-cancel-ask");
  await tid("k1-cancel-yes").getByRole("button").click();
  await p.waitForFunction(() => !location.pathname.startsWith("/estimate/new"), null, { timeout: 5000 });
  await p.getByTestId("estimate-screen-actions").locator("visible=true").first().waitFor({ timeout: 5000 });
  h.expect(new URL(p.url()).pathname === `/estimate/${ID}`, `one step back, to the estimate (${new URL(p.url()).pathname})`);
  await waitDraft(false);
  await open();
  await edit("Правка 523 · двойное");
  await tid("ue-save").dblclick();
  await p.getByTestId("ue-title").waitFor({ state: "detached", timeout: 5000 });
  const savedToasts = (await p.getByTestId("toast-text").allInnerTexts()).filter((x) => /Сохран/.test(x)).length;
  h.expect(savedToasts <= 1, `«Готово» pressed twice: saved once (${savedToasts} toasts)`);

  // §10: «Готово» without the network — saved on the phone, goes later (the queue), the draft is gone
  await open();
  await edit("Правка 523 · без сети");
  await p.context().setOffline(true);
  await tid("ue-save").click();
  await p.getByTestId("ue-title").waitFor({ state: "detached", timeout: 5000 });
  await waitDraft(false);
  await p.context().setOffline(false);
  h.expect((await flushedSaved()).title === "Правка 523 · без сети", "offline «Готово»: the estimate saved on the phone (the queue sends it)");

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
