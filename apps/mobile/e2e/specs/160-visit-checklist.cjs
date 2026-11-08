/**
 * e2e 160 — the checklist on the visit screen (docs/specs/08 §4, §7.3; step 14 CH1c; S10).
 * A warning, never a lock (founder 05.11): «Дальше: Работа» without photos before → «Нет фото до работы» → «Заполнить»
 * keeps the step, «Пропустить» goes on. At work: a tick, a photo for a photo item (the item is done by it), the counter.
 * The signature with a required item open and photos after short → «Не заполнено: N» → «Заполнить» keeps the step,
 * «Пропустить» marks the item skipped (still not done) and the visit is signed. Found by testID.
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const A = "e160-a"; // required tick
const B = "e160-b"; // optional tick
const C = "e160-c"; // required photo item
const D = "e160-d"; // required tick, left open → skipped

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  // the tech on a visit he is on site at; the company wants 2 photos after work
  const id = await p.evaluate(({ A, B, C, D }) => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    const v = s.db.visits.find((x) => x.jobId && x.step === "scheduled");
    Object.assign(v, {
      step: "on_site", photos: [], techId: s.db.me, assigneeIds: [s.db.me],
      checklist: [
        { id: A, label: "Confirm scope", done: false, kind: "check", required: true },
        { id: B, label: "Gate code", done: false, kind: "check", required: false },
        { id: C, label: "Photo of the area", done: false, kind: "photo", required: true },
        { id: D, label: "Walk through", done: false, kind: "check", required: true },
      ],
    });
    s.db.company.visitSettings = { minPhotosAfter: 2 };
    localStorage.setItem(k, JSON.stringify(s));
    localStorage.setItem("octo.role.v1", JSON.stringify("tech"));
    return v.id;
  }, { A, B, C, D });
  await h.go(`/visit/${id}`);
  const visit = async () => (await h.db()).visits.find((x) => x.id === id);
  const missing = () => p.getByTestId("chk-missing").last();
  const waitStep = async (step) => {
    for (let i = 0; i < 20 && (await visit()).step !== step; i++) await p.waitForTimeout(150);
    h.expect((await visit()).step === step, `step ${step}`);
  };

  // before work: no photo before — a warning, not a lock
  const next = p.getByRole("button", { name: /^Дальше: Работа/ }).last();
  h.expect(await next.isEnabled(), "«Дальше: Работа» is not locked without photos");
  await next.click();
  await missing().waitFor();
  h.expect(/Нет фото до работы/.test(await h.sheet().innerText()), "the warning says what is missing");
  await h.shot("before-warning");
  await p.getByTestId("chk-fill").last().click();
  await missing().waitFor({ state: "hidden" });
  h.expect((await visit()).step === "on_site", "«Заполнить» keeps the step");
  await next.click();
  await missing().waitFor();
  await p.getByTestId("chk-skip").last().click();
  await waitStep("working");

  // at work: the counter of required items, a tick, a photo for the photo item
  const left = p.getByTestId("chk-left").last();
  await left.waitFor();
  h.expect(/Осталось обязательных: 3/.test(await left.innerText()), "3 required left (the optional one does not count)");
  await p.getByTestId(`chk-item-${A}`).last().click();
  for (let i = 0; i < 10 && !(await visit()).checklist.find((x) => x.id === A).done; i++) await p.waitForTimeout(150);
  h.expect((await visit()).checklist.find((x) => x.id === A).done, "the tick is saved");
  const add = p.getByTestId(`chk-item-${C}`).last().getByRole("button", { name: "Добавить фото" });
  await add.scrollIntoViewIfNeeded();
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), add.click()]);
  await chooser.setFiles({ name: "area.png", mimeType: "image/png", buffer: PNG });
  for (let i = 0; i < 20 && !((await visit()).checklist.find((x) => x.id === C).photoIds || []).length; i++) await p.waitForTimeout(150);
  {
    const v = await visit();
    const c = v.checklist.find((x) => x.id === C);
    h.expect(c.photoIds?.length === 1 && v.photos.some((ph) => ph.id === c.photoIds[0] && ph.kind === "after"), "the item's photo is a photo after work of the visit");
  }
  await p.waitForTimeout(300);
  h.expect(/Осталось обязательных: 1/.test(await left.innerText()), "1 required left");
  await h.shot("work");

  // the signature: «Walk through» open and one photo after short → «Не заполнено: 2»
  const draw = async () => {
    const pad = p.getByLabel(/расписывается/i).last();
    await pad.scrollIntoViewIfNeeded();
    await p.waitForTimeout(250);
    const bb = await pad.boundingBox();
    await p.mouse.move(bb.x + 30, bb.y + 60);
    await p.mouse.down();
    for (let i = 0; i < 20; i++) await p.mouse.move(bb.x + 30 + i * 10, bb.y + 60 - Math.sin(i / 2) * 25);
    await p.mouse.up();
    await h.click("Подтвердить подпись");
  };
  await draw();
  await missing().waitFor();
  const sheetText = await missing().innerText();
  h.expect(/Walk through/.test(sheetText) && /Фото после работы: ещё 1/.test(sheetText), `the sheet lists what is missing: ${sheetText}`);
  h.expect(!/Gate code/.test(sheetText), "an optional item is not asked");
  const title = await h.sheet().innerText();
  h.expect(/Не заполнено: 2/.test(title), `the title counts what is missing: ${title.slice(0, 200)}`);
  await h.shot("sign-warning");
  await p.getByTestId("chk-fill").last().click();
  await missing().waitFor({ state: "hidden" });
  h.expect((await visit()).step === "working", "«Заполнить» keeps the visit at work");

  await draw();
  await missing().waitFor();
  await p.getByTestId("chk-skip").last().click();
  await waitStep("signed");
  {
    const v = await visit();
    const d = v.checklist.find((x) => x.id === D);
    h.expect(!d.done && d.na && d.na.at, "the skipped item is marked skipped and stays not done");
    h.expect(!v.checklist.find((x) => x.id === B).na, "an optional item is not skipped");
    h.expect(v.signature, "the visit is signed");
  }
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
