/**
 * e2e 308 — закреплённая панель сметы (РС-7c1, DS §8.9, #1169), every view; by testID (rule 19):
 * - a phone (390): the bar is pinned at the bottom (its one step in it), the content can be scrolled clear of it; from 820 there is no bar,
 *   the step stands in the column;
 * - never off (v2 #2350): with no line the step is «Добавить позицию» (it opens the price list); once there is a line the bar's main one
 *   is «Отправить» with «Готово» before it (#2935, «как у Джобер»; no send icon in the header), «⋯» has no send (#2403); «Отправить»
 *   with no client says what is missing and takes the page there;
 * - the hint goes when ITS thing is there: no client → «Выберите клиента», the client chosen → gone (the empty list is another hint);
 * - the missing thing is scrolled into view ABOVE the bar;
 * - a double press saves once (one catalog item for the line that is sent to the catalog);
 * - review 27.11 (#2935 п.1–2): a long sum and its tax are never cut — $123,456.78 and «налог $9,144.95» whole on every view (on a
 *   phone: «Итого · налог» on the caption line of the bar, the sum under it, clear of «Готово» / «Отправить»; it takes its own line
 *   when they do not stand in one row); an estimate the client already has says «Отправить изменения» (its words and VoiceOver's).
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const phone = h.layout.width < 820;
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  // v2 #2350: the bar's one step — «Добавить позицию» while there is no line, «Готово» with lines; «Итого» beside it on a phone
  await tid("est-bar-add").waitFor({ timeout: 5000 });
  const bar = p.getByTestId("est-bar-add-bar").locator("visible=true");
  if (phone) {
    await bar.first().waitFor({ timeout: 3000 });
    const bb = await bar.first().boundingBox();
    const vh = p.viewportSize().height;
    // visual v2 №5: the bar is a card `cardGap` 8 over the bottom zone
    h.expect(vh - (bb.y + bb.height) >= 0 && vh - (bb.y + bb.height) < 12, `the bar is pinned at the bottom (${Math.round(bb.y + bb.height)} of ${vh})`);
    const sv = await tid("est-bar-add").boundingBox();
    h.expect(sv.y >= bb.y && sv.y + sv.height <= bb.y + bb.height + 1, "the step is in the bar");
    // the content can be scrolled clear of the bar
    await tid("est-deposit-row").scrollIntoViewIfNeeded();
    await p.evaluate(() => { let e = document.querySelector('[data-testid="est-deposit-row"]'); while (e && !(e.scrollHeight > e.clientHeight + 50)) e = e.parentElement; if (e) e.scrollTop = e.scrollHeight; });
    await p.waitForFunction(() => new Promise((r) => { let n = 0; const f = () => (++n > 12 ? r(true) : requestAnimationFrame(f)); f(); }), null, { timeout: 5000 });
    const last = await tid("est-deposit-row").boundingBox();
    const bb2 = await bar.first().boundingBox();
    h.expect(last.y + last.height <= bb2.y + 1, "the last button of the page stands clear of the bar");
  } else {
    h.expect((await p.getByTestId("est-bar-total").locator("visible=true").count()) === 0, "from 820 there is no pinned bar: the step is in the column");
  }
  // never off: «Добавить позицию» is a step, not a pale button — it opens the price list (the demo company has one)
  const addBtn = tid("est-bar-add");
  h.expect((await addBtn.getAttribute("aria-disabled")) !== "true" && !(await addBtn.isDisabled()), "the step is not off with an empty estimate");
  await addBtn.click();
  await tid("est-catalog-picker").waitFor({ timeout: 3000 });
  await pressEscUntilClosed(p);
  // no line: no «Отправить» (#2935: the bar's main one once there is a line; «⋯» does not hold it) — nothing to send, nothing saved
  const before = ((await h.db()).estimates ?? []).length;
  h.expect((await tid("est-bar-send").count()) === 0, "no line: no «Отправить»");
  h.expect(!(await line.editorMenuHas(h, "ue-save-send")), "«⋯» has no send");
  // a line: «Отправить» is the main one of the bar, «Готово» the second beside it (#2935, «как у Джобер»); a double press saves once
  await line.addCustom(h, "Work", 50);
  await line.wholeBar(h);
  await tid("est-bar-send").waitFor({ timeout: 3000 });
  {
    const [send, done] = [await tid("est-bar-send").boundingBox(), await tid("ue-save").boundingBox()];
    h.expect(done.x + done.width <= send.x + 1 && Math.abs(done.y + done.height / 2 - (send.y + send.height / 2)) < 8, `one row: «Готово» before «Отправить» (${Math.round(done.x)} / ${Math.round(send.x)})`);
    h.expect((await p.locator('[data-testid="estimate-editor"] [aria-label="Сохранить и отправить"]:not([data-testid="est-bar-send"]), [data-testid="estimate-editor"] [aria-label="Отправить изменения"]:not([data-testid="est-bar-send"])').count()) === 0, "no send icon in the header");
    // a11y (review 27.11): the bottom «Отправить» reads what the header's ➤ read — «Сохранить и отправить» (a draft)
    h.expect((await tid("est-bar-send").getAttribute("aria-label")) === "Сохранить и отправить", `«Отправить» reads «Сохранить и отправить» (${await tid("est-bar-send").getAttribute("aria-label")})`);
  }
  const id = (await p.locator('[data-testid^="est-line-"]').first().getAttribute("data-testid")).replace("est-line-", "");
  // «⋯ → Добавить в каталог» (E19): the item is made at once — a double press of «Готово» makes no second one
  const cat0 = ((await h.db()).catalog ?? []).length;
  await line.menu(h, id);
  await tid(`est-act-catalog-${id}`).click();
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.catalog ?? []).length === n + 1, cat0, { timeout: 5000 });
  // (a phone scrolled down: the bar is the capsule «˄ $…» — a tap brings «Готово» back, #2363 q72; the 2×2 add buttons make the page longer)
  await line.wholeBar(h);
  // two presses in ONE tick (a fast double tap before the screen has redrawn)
  await tid("ue-save").evaluate((el) => { el.click(); el.click(); });
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).length === n + 1, before, { timeout: 8000 });
  await p.waitForFunction(() => !/\/estimate\/new/.test(location.pathname), null, { timeout: 8000 });
  h.expect(((await h.db()).catalog ?? []).length === cat0 + 1, "a double press made one catalog item, not two");

  // no client: the picker stands first; closed, «Отправить» says «Выберите клиента»; choosing one takes that hint away
  await h.go("/estimate/new");
  await h.sheet().waitFor({ timeout: 8000 });
  await pressEscUntilClosed(p);
  await line.addCustom(h, "Work", 50);
  await line.saveSend(h);
  await tid("ue-missing-client").waitFor({ timeout: 3000 });
  await tid("est-client-card").click();
  await h.sheet().getByText("David Kim").first().click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="ue-missing-client"]').length === 0, null, { timeout: 4000 });
  h.expect((await tid("ue-save").count()) >= 1, "the hint of the client is gone with the client chosen; the step stands");

  // review 27.11 (#2935 п.1): $114,311.83 + 8 % tax = $123,456.78, the tax $9,144.95 — neither is cut, on every view
  const totals = require("../estimateTotals.cjs");
  const SUM = "$123,456.78";
  const TAX = "$9,144.95";
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Whole house", "114311.83");
  await totals.setTax(h, "8");
  h.expect((await totals.sumIs(h, "est-tax-row", TAX)) === TAX, `the tax ${TAX}`);
  /** every visible leaf that reads `text`: at least one, none cut («…» / overflow) */
  const whole = (text) => p.evaluate((x) => {
    const leaves = [...document.querySelectorAll("body *")].filter((e) => e.childElementCount === 0 && e.offsetParent !== null && (e.textContent || "").includes(x));
    return { n: leaves.length, cut: leaves.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => `${e.textContent} ${e.scrollWidth}>${e.clientWidth}`) };
  }, text);
  const box = async (sel) => { const l = p.locator(sel).locator("visible=true").first(); return (await l.count()) ? l.boundingBox() : null; };
  const apart = (a, b) => !a || !b || a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1;
  const wholeTotal = async (what) => {
    for (const x of [SUM, TAX]) {
      const r = await whole(x);
      h.expect(r.n >= 1 && r.cut.length === 0, `${what}: ${x} is seen whole (${r.n} seen; cut: ${r.cut.join(", ") || "none"})`);
    }
    if (!phone) return;
    const [cap, sum] = [tid("est-bar-total-caption"), tid("est-bar-total-sum")];
    h.expect((await cap.innerText()).trim() === `Итого · налог ${TAX}`, `${what}: the bar's caption line «Итого · налог ${TAX}» (${(await cap.innerText()).trim()})`);
    h.expect((await sum.innerText()).trim() === SUM, `${what}: the bar's sum ${SUM}`);
    const [c, m, done, send, barBox] = [await cap.boundingBox(), await sum.boundingBox(), await box('[data-testid="ue-save"]'), await box('[data-testid="est-bar-send"]'), await box('[data-testid="ue-save-bar"]')];
    for (const [n, b] of [["caption", c], ["sum", m]]) {
      h.expect(apart(b, done) && apart(b, send), `${what}: the ${n} stands clear of «Готово» and «Отправить»`);
      h.expect(b.x >= barBox.x && b.x + b.width <= barBox.x + barBox.width + 1 && b.y >= barBox.y - 1 && b.y + b.height <= barBox.y + barBox.height + 1, `${what}: the ${n} is inside the bar`);
    }
  };
  await line.wholeBar(h);
  await wholeTotal("a draft");
  h.expect((await tid("est-bar-send").innerText()).trim() === "Отправить", "a draft: «Отправить»");
  // #2935 п.2 (CRM review): the client has it (sent) — the main one is «Отправить изменения», its words and VoiceOver's
  await tid("ue-save").click();
  await p.waitForFunction(() => !/\/estimate\/new/.test(location.pathname), null, { timeout: 8000 });
  const isBig = (e) => e.customerId === "c2" && e.doc?.settings?.tax?.ratePpm === 80000;
  await p.waitForFunction((f) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).some(new Function(`return ${f}`)()), isBig.toString(), { timeout: 8000 });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const big = raw.db.estimates.find(isBig);
  h.expect(big?.totalCents === 12345678, `the big estimate is saved with $123,456.78 (${big?.totalCents})`);
  big.status = "sent";
  big.sentAt = new Date().toISOString();
  await h.seed("octo.db.v5", raw);
  await h.go(`/estimate/new?id=${big.id}`);
  await tid("est-bar-send").waitFor({ timeout: 8000 });
  h.expect((await tid("est-bar-send").innerText()).trim() === "Отправить изменения", `a sent one: «Отправить изменения» (${(await tid("est-bar-send").innerText()).trim()})`);
  h.expect((await tid("est-bar-send").getAttribute("aria-label")) === "Отправить изменения", "a sent one: VoiceOver reads «Отправить изменения»");
  await line.wholeBar(h);
  await wholeTotal("a sent one");
  await h.shot("long-total-sent");
};
