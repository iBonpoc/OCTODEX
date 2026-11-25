/**
 * e2e 308 — закреплённая панель сметы (РС-7c1, DS §8.9, #1169), every view; by testID (rule 19):
 * - a phone (390): the bar is pinned at the bottom (its one step in it), the content can be scrolled clear of it; from 820 there is no bar,
 *   the step stands in the column;
 * - never off (v2 #2350): with no line the step is «Добавить позицию» (it opens the price list); the round ➤ of the header is drawn once
 *   there is a line, «⋯» has no send (#2403); ➤ with no client says what is missing and takes the page there;
 * - the hint goes when ITS thing is there: no client → «Выберите клиента», the client chosen → gone (the empty list is another hint);
 * - the missing thing is scrolled into view ABOVE the bar;
 * - a double press saves once (one catalog item for the line that is sent to the catalog).
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
  // no line: no ➤ in the header (#2403: sending is the round ➤ only, drawn once there is a line; «⋯» does not hold it) — nothing to send, nothing saved
  const before = ((await h.db()).estimates ?? []).length;
  h.expect((await tid("est-send-top").count()) === 0, "no line: no ➤ in the header");
  h.expect(!(await line.editorMenuHas(h, "ue-save-send")), "«⋯» has no send");
  // a line: the ➤ comes, a double press saves once
  await line.addCustom(h, "Work", 50);
  await tid("est-send-top").locator("visible=true").first().waitFor({ timeout: 3000 });
  const id = (await p.locator('[data-testid^="est-line-"]').first().getAttribute("data-testid")).replace("est-line-", "");
  await tid(`est-line-${id}`).click();
  await tid(`est-save-catalog-${id}`).getByRole("switch").click();
  const cat0 = ((await h.db()).catalog ?? []).length;
  // (a phone scrolled down: the bar is the capsule «˄ $…» — a tap brings «Готово» back, #2363 q72; the 2×2 add buttons make the page longer)
  await line.wholeBar(h);
  // two presses in ONE tick (a fast double tap before the screen has redrawn)
  await tid("ue-save").evaluate((el) => { el.click(); el.click(); });
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).length === n + 1, before, { timeout: 8000 });
  await p.waitForFunction(() => !/\/estimate\/new/.test(location.pathname), null, { timeout: 8000 });
  h.expect(((await h.db()).catalog ?? []).length === cat0 + 1, "a double press made one catalog item, not two");

  // no client: the picker stands first; closed, ➤ says «Выберите клиента»; choosing one takes that hint away
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
};
