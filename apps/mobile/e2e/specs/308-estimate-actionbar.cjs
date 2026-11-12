/**
 * e2e 308 — закреплённая панель сметы (РС-7c1, DS §8.9, #1169), every view; by testID (rule 19):
 * - a phone (390): the bar is pinned at the bottom (the buttons in it), the content can be scrolled clear of it; from 820 there is no bar,
 *   the same buttons stand in the column;
 * - the buttons are never off: a press with no line says what is missing under the list and takes the page there;
 * - the hint goes when ITS thing is there: no client → «Выберите клиента», the client chosen → gone (the empty list is another hint);
 * - the missing thing is scrolled into view ABOVE the bar; «Сохранить и отправить» is never off either;
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
  await tid("ue-save").waitFor({ timeout: 5000 });
  const bar = p.getByTestId("est-actionbar").locator("visible=true");
  if (phone) {
    await bar.first().waitFor({ timeout: 3000 });
    const bb = await bar.first().boundingBox();
    const vh = p.viewportSize().height;
    h.expect(Math.abs(bb.y + bb.height - vh) < 4, `the bar is pinned at the bottom (${Math.round(bb.y + bb.height)} of ${vh})`);
    const sv = await tid("ue-save").boundingBox();
    h.expect(sv.y >= bb.y && sv.y + sv.height <= bb.y + bb.height + 1, "the buttons are in the bar");
    // the content can be scrolled clear of the bar
    await tid("est-add-section").scrollIntoViewIfNeeded();
    await p.evaluate(() => { let e = document.querySelector('[data-testid="est-add-section"]'); while (e && !(e.scrollHeight > e.clientHeight + 50)) e = e.parentElement; if (e) e.scrollTop = e.scrollHeight; });
    await p.waitForFunction(() => new Promise((r) => { let n = 0; const f = () => (++n > 12 ? r(true) : requestAnimationFrame(f)); f(); }), null, { timeout: 5000 });
    const last = await tid("est-add-section").boundingBox();
    const bb2 = await bar.first().boundingBox();
    h.expect(last.y + last.height <= bb2.y + 1, "the last button of the page stands clear of the bar");
  } else {
    h.expect((await bar.count()) === 0, "from 820 there is no pinned bar: the buttons are in the column");
  }
  // never off
  const saveBtn = tid("ue-save").getByRole("button");
  h.expect((await saveBtn.getAttribute("aria-disabled")) !== "true" && !(await saveBtn.isDisabled()), "«Сохранить» is not off with an empty estimate");
  // pressed with no line: what is missing, under the list — in view above the bar (a phone)
  const before = ((await h.db()).estimates ?? []).length;
  await saveBtn.click();
  await tid("ue-missing-lines").waitFor({ timeout: 3000 });
  h.expect(((await h.db()).estimates ?? []).length === before, "nothing was saved");
  await p.waitForFunction((phone) => { const e = document.querySelector('[data-testid="ue-missing-lines"]'); if (!e) return false; const r = e.getBoundingClientRect(); const bar = document.querySelector('[data-testid="est-actionbar"]'); const limit = phone && bar ? bar.getBoundingClientRect().top : window.innerHeight; return r.top >= 0 && r.bottom <= limit + 1; }, phone, { timeout: 5000 });
  const sendBtn = p.getByTestId("ue-save-send").locator("visible=true");
  if (await sendBtn.count()) h.expect(!(await sendBtn.first().getByRole("button").isDisabled()), "«Сохранить и отправить» is not off either");
  // a line: the hint goes, a double press saves once
  await line.addCustom(h, "Work", 50);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="ue-missing-lines"]').length === 0, null, { timeout: 3000 });
  const id = (await p.locator('[data-testid^="est-line-"]').first().getAttribute("data-testid")).replace("est-line-", "");
  await tid(`est-line-${id}`).click();
  await tid(`est-save-catalog-${id}`).getByRole("switch").click();
  const cat0 = ((await h.db()).catalog ?? []).length;
  // two presses in ONE tick (a fast double tap before the screen has redrawn)
  await tid("ue-save").getByRole("button").evaluate((el) => { el.click(); el.click(); });
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).length === n + 1, before, { timeout: 8000 });
  await p.waitForFunction(() => !/\/estimate\/new/.test(location.pathname), null, { timeout: 8000 });
  h.expect(((await h.db()).catalog ?? []).length === cat0 + 1, "a double press made one catalog item, not two");

  // no client: the picker stands first; closed, «Сохранить» says «Выберите клиента»; choosing one takes that hint away
  await h.go("/estimate/new");
  await h.sheet().waitFor({ timeout: 8000 });
  await pressEscUntilClosed(p);
  await tid("ue-save").getByRole("button").click();
  await tid("ue-missing-client").waitFor({ timeout: 3000 });
  await p.getByRole("button", { name: "Клиент", exact: true }).first().click();
  await h.sheet().getByText("David Kim").first().click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="ue-missing-client"]').length === 0, null, { timeout: 4000 });
  h.expect((await tid("ue-save").count()) === 1, "the hint of the client is gone with the client chosen");
};
