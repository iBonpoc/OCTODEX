const { expectOneAccent } = require("../accent.cjs");
const { dayKey, todayKey } = require("../companyTime.cjs");
const { visitStep, visitAct } = require("../visitScreen.cjs");
const { pressUndo } = require("../gutters.cjs");
// v2 «Мой день» (OverviewScreen): the tile «Выезды» says the day's progress to a screen reader («…, Готово 1 из 3»)
const progress = async (p) => (await p.getByTestId("tile-visits").locator("visible=true").first().getAttribute("aria-label")) || "";
/** Technician day: summary → open next visit → en route → on site → photo (view, delete, undo) → own checklist item → all checked → sign → pay → progress grows. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// The photo viewer's delete/undo toast comes after an async step with no screen change to wait for: this spec still uses the
// fixed waits of h.go / h.click (#906 п.4 follow-up: move it to waiting for the saved state).
exports.fixedWaits = true;
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/visits");
  await expectOneAccent(h, "Visits (tech)");
  let db = await h.db();
  const mine = db.visits.filter((v) => v.techId === db.me && dayKey(v.start) === todayKey()); // the company's today (П4b)
  h.expect(mine.length > 0, "tech has visits today");
  const doneBefore = mine.filter((v) => v.step === "paid").length;
  h.expect(new RegExp(`Готово ${doneBefore} из ${mine.length}`).test(await progress(p)), `day progress: ${await progress(p)}`);
  // a zero tile draws nothing (StatGrid): «Собрал сегодня» stands once there is money of today
  const collected0 = (await h.db()).visits.filter((x) => x.techId === db.me && dayKey(x.start) === todayKey() && (x.payment?.amountCents ?? 0) > 0).length;
  if (collected0) await h.expectText(/Собрал сегодня/, "collected tile");
  await h.shot("day");

  // v2: the card «Дальше» holds the ONE main step «В пути» of the next visit not over; then «Продолжить выезд» opens it
  const nowMs = Date.now();
  const next = mine.filter((v) => v.step === "scheduled" && Date.parse(v.start) + v.durationMin * 60_000 > nowMs).sort((a, b) => a.start.localeCompare(b.start))[0];
  h.expect(!!next, "a visit of today not started and not over");
  await p.getByTestId("home-main-en-route").locator("visible=true").first().click();
  await p.waitForFunction((vid) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits?.find((x) => x.id === vid)?.step === "en_route", next.id, { timeout: 5000 });
  await p.getByTestId("home-main-continue").locator("visible=true").first().click();
  await p.waitForURL(/\/visit\//, { timeout: 5000 });
  const id = p.url().split("/visit/")[1];
  let v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(id === next.id && v.step === "en_route", "«В пути» of «Дальше» started the next visit, «Продолжить» opened it");
  if (v.checklist.length) {
    const cell = p.getByTestId("chk-left").locator("visible=true").first();
    await cell.waitFor();
    // #2363 F38: not begun — «4 пункта»; begun — «1 из 4 · 25 %»
    h.expect(new RegExp(`из ${v.checklist.length}|^\\D*${v.checklist.length} пункт`, "m").test(await cell.innerText()), `checklist visible before work: ${await cell.innerText()}`);
  }

  await visitStep(p, "on-site");
  // S10 (17-job §4): «На месте» starts the job
  {
    const d = await h.db();
    const vj = d.visits.find((x) => x.id === id);
    h.expect(vj.jobId && d.jobs.find((j) => j.id === vj.jobId)?.status === "in_progress", "«На месте» → the job is in progress");
  }
  // photo before: the file picker on web
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: "Добавить фото" }).last().click()]);
  await chooser.setFiles({ name: "before.png", mimeType: "image/png", buffer: PNG });
  await p.waitForTimeout(600);
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.photos.length === 1, "photo added");
  // view → delete → undo
  await h.page.locator('[data-testid^="photo-thumb-"]').locator("visible=true").first().click();
  await h.click("Удалить фото");
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.photos.length === 0, "photo deleted");
  await pressUndo(p);
  await p.waitForFunction((vid) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits?.find((x) => x.id === vid)?.photos?.length === 1, id, { timeout: 5000 });
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.photos.length === 1, "undo restores the photo");

  await visitStep(p, "work");
  // own checklist item: «⋯ → Добавить пункт» (v2)
  await visitAct(p, "visit-act-add-item");
  await p.getByPlaceholder("Свой пункт чек-листа").last().fill("Check for leaks");
  await h.click("Добавить");
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.checklist.some((x) => x.label === "Check for leaks" && !x.done), "own item added");
  for (const item of v.checklist.filter((x) => !x.done)) {
    await p.getByTestId(`chk-item-${item.id}`).locator("visible=true").first().click();
    await p.waitForTimeout(120);
  }
  await p.waitForTimeout(400);
  v = (await h.db()).visits.find((x) => x.id === id);
  h.expect(v.checklist.every((x) => x.done), `all items checked: ${JSON.stringify(v.checklist)}`);
  await h.shot("work");

  // client signs on the tech's phone: «Завершить» turns the body to the pad (v2)
  await visitStep(p, "finish");
  const pad = p.getByLabel(/расписывается/i).last();
  await pad.scrollIntoViewIfNeeded();
  await p.waitForTimeout(250);
  const bb = await pad.boundingBox();
  await p.mouse.move(bb.x + 30, bb.y + 60);
  await p.mouse.down();
  for (let i = 0; i < 20; i++) await p.mouse.move(bb.x + 30 + i * 10, bb.y + 60 - Math.sin(i / 2) * 25);
  await p.mouse.up();
  await h.click("Подтвердить подпись");
  // no photos after work: a warning, not a lock (docs/specs/08 §4) — «Пропустить» goes on to the payment
  await p.getByTestId("chk-missing").last().waitFor();
  await p.getByTestId("chk-skip").last().click();
  await p.getByTestId("visit-method-button").locator("visible=true").first().click(); // the method is a row with a menu (spec 56 wave 5а)
  await p.getByTestId("visit-method-cash").locator("visible=true").first().click();
  await visitStep(p, "pay");
  db = await h.db();
  v = db.visits.find((x) => x.id === id);
  h.expect(v.step === "paid" && v.payment && v.payment.method === "cash", "paid in cash");
  // paying does not close the job: the office is asked «Работа выполнена?» (S10)
  h.expect(v.jobId && db.jobs.find((j) => j.id === v.jobId)?.status === "in_progress", "the job is not closed by the payment");

  await h.go("/visits");
  await p.getByTestId("tile-visits").locator("visible=true").first().waitFor();
  h.expect(new RegExp(`Готово ${doneBefore + 1} из ${mine.length}`).test(await progress(p)), `progress grew: ${await progress(p)}`);
  // the cash taken is the tech's «Собрал сегодня»
  await p.getByTestId("tile-collected").locator("visible=true").first().waitFor({ timeout: 5000 });
  await h.expectText(/Собрал сегодня/, "collected tile after the payment");
  await h.shot("after");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
