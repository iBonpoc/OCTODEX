/**
 * e2e 447 — быстрая правка одной цены (docs/specs/53-price-update.md §6.3, волна 53-1; стык S0d-1). Every view.
 * - «Цены и прайс» модуля Gutters, тестовые позиции созданы: нажатие на карточку материала открывает шторку «Цена»;
 *   закупка и наценка → «Сохранить» — 2 нажатия (карточка, «Сохранить»): закупка и наценка в каталоге, цена клиенту
 *   посчитана (2.40 × 1.30 = $3.12), пометка в данных снята (надписи «тестовая цена» нет нигде, #1873);
 * - «Сохранить» без правки: пометка остаётся (правило 9);
 * - работа: цена клиенту → «Сохранить» → «Отменить» в тосте возвращает тестовую цену;
 * - закрыть шторку с изменённым вводом: вопрос «Сохранить изменения?» → «Не сохранять» — цена прежняя;
 * - наценка 0 % у материала — предупреждение;
 * - мастер шторку не открывает.
 * Finds things by testID and the store; waits on what it checks.
 */
const { sheetGone } = require("../sheet.cjs");
const { undo } = require("../estimateLine.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  /** waits until `pred(db)` (run in the page on the stored state) is true; throws with `what` */
  const waitDb = async (pred, what) => {
    await p.waitForFunction(([k, src]) => {
      const d = (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {};
      // eslint-disable-next-line no-new-func
      return !!new Function("db", `return (${src})(db)`)(d);
    }, [KEY, pred.toString()], { timeout: 8000 }).catch(() => { throw new Error(what); });
    h.expect(true, what);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {}, KEY);
  const catalog = async () => (await db()).catalog || [];
  const byAttrs = async (pred) => (await catalog()).find((x) => x.attributes && pred(x.attributes));
  /** the part keys of the cards in a state: gpr-test-<key> / gpr-found-<key> */
  const keys = (state) => p.locator(`[data-testid^=gpr-${state}-]`).locator("visible=true").evaluateAll((els, s) => els.map((e) => e.getAttribute("data-testid").slice(`gpr-${s}-`.length)), state);
  let taps = 0;
  const tap = async (loc) => { taps++; await loc.click(); };

  await h.seed("octo.role.v1", "director");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitDb((db) => !!db.company?.modules?.gutters?.trialEndsAt, "trial on");
  await h.go("/module/gutters/prices");
  await tid("gpr-screen").waitFor({ timeout: 5000 });
  // the test items, as «Создать позиции сразу» makes them (cost = the test price, no markup)
  await tid("gpr-missing-n-action").getByRole("button").click();
  await tid("gpr-all-found").waitFor({ timeout: 8000 });
  const parts = (await keys("test")).filter((k) => !k.startsWith("labor."));
  h.expect(parts.length >= 2, `test-priced parts are there (${parts.length})`);
  const [mat, mat2] = parts;

  // «Сохранить» without a change keeps the test mark
  await tid(`gpr-test-${mat2}`).click();
  await tid("qp-sheet").waitFor({ timeout: 5000 });
  h.expect((await tid("qp-test").count()) === 0, "no sample-price note in the sheet (#1873)");
  await tid("qp-nomarkup").waitFor({ timeout: 3000 });
  await h.shot("sheet");
  await tid("qp-save").getByRole("button").click();
  await sheetGone(p);
  h.expect((await tid(`gpr-test-${mat2}`).count()) === 1, "an untouched sample price stays marked in the data");

  // a material: the card, then «Сохранить» — two taps
  taps = 0;
  await tap(tid(`gpr-test-${mat}`));
  await tid("qp-sheet").waitFor({ timeout: 5000 });
  await tid("qp-cost").locator("input").fill("2.40");
  await tid("qp-markup").locator("input").fill("30");
  await p.getByTestId("qp-client").locator("visible=true").getByText(/\$3\.12/).waitFor({ timeout: 5000 })
    .catch(async () => { throw new Error(`the client price is counted live (2.40 × 1.30): ${await tid("qp-client").innerText()} · cost «${await tid("qp-cost").locator("input").inputValue()}» markup «${await tid("qp-markup").locator("input").inputValue()}»`); });
  h.expect((await tid("qp-nomarkup").count()) === 0, "with a markup — no warning");
  await tap(tid("qp-save").getByRole("button"));
  await sheetGone(p);
  h.expect(taps === 2, `two taps (${taps})`);
  await tid(`gpr-found-${mat}`).waitFor({ timeout: 5000 });
  h.expect(/\$3\.12/.test(await tid(`gpr-found-${mat}`).innerText()), "the card shows the new price");
  await waitDb((db) => (db.catalog || []).some((x) => x.costCents === 240 && x.markupBps === 3000 && x.priceCents === 312 && !x.placeholder),
    "the catalog keeps the cost, the markup and the price; the test mark is gone");
  await h.shot("saved");

  // #1826 money bug (audit 16.11): the sheet must not remember what was typed for the previous item.
  // A saved → B opens with B's own cost and markup, «Клиенту» is B's price; «Сохранить» untouched writes nothing to B.
  const fieldCents = async (id) => Math.round(parseFloat((await tid(id).locator("input").inputValue()).replace(/[$,%\s]/g, "") || "0") * 100);
  const bKey = (await keys("test")).find((k) => !k.startsWith("labor.") && k !== mat);
  await tid(`gpr-test-${bKey}`).click();
  await tid("qp-sheet").waitFor({ timeout: 5000 });
  const bCost = await fieldCents("qp-cost");
  const bMarkup = await fieldCents("qp-markup");
  h.expect(!(bCost === 240 && bMarkup === 3000), `B opens with its own cost and markup, not A's 2.40 / 30 % (${bCost} / ${bMarkup})`);
  h.expect(!/\$3\.12/.test(await tid("qp-client").innerText()), "B's «Клиенту» is not A's $3.12");
  const before447 = JSON.stringify((await catalog()).map((x) => [x.id, x.priceCents, x.costCents, x.markupBps, !!x.placeholder]));
  await tid("qp-save").getByRole("button").click();
  await sheetGone(p);
  h.expect(JSON.stringify((await catalog()).map((x) => [x.id, x.priceCents, x.costCents, x.markupBps, !!x.placeholder])) === before447, "«Сохранить» on B untouched changes nothing in the catalog");
  // A typed and thrown away («Не сохранять») → B opens clean: its own values, no «Сохранить изменения?» on close
  await tid(`gpr-found-${mat}`).click();
  await tid("qp-sheet").waitFor({ timeout: 5000 });
  await tid("qp-cost").locator("input").fill("9.99");
  await tid("sheet-close").click();
  await h.expectText(/Сохранить изменения\?/, "unsaved question on close (A)");
  await p.getByRole("button", { name: "Не сохранять" }).locator("visible=true").click();
  await sheetGone(p);
  await tid(`gpr-test-${bKey}`).click();
  await tid("qp-sheet").waitFor({ timeout: 5000 });
  h.expect((await fieldCents("qp-cost")) !== 999, "B does not get A's thrown-away 9.99");
  await tid("sheet-close").click();
  await sheetGone(p);
  h.expect((await p.getByText("Сохранить изменения?").locator("visible=true").count()) === 0, "B untouched closes without the question (not dirty)");
  // A reopened after «Не сохранять» shows A's saved values, not the thrown-away ones
  await tid(`gpr-found-${mat}`).click();
  await tid("qp-sheet").waitFor({ timeout: 5000 });
  h.expect((await fieldCents("qp-cost")) === 240, `A reopened shows its saved 2.40, not the thrown-away 9.99 (${await fieldCents("qp-cost")})`);
  await tid("sheet-close").click();
  await sheetGone(p);

  // labor: the price, then «Отменить» takes it back
  await tid("gpr-test-labor.install.story1").click();
  await tid("qp-sheet").waitFor({ timeout: 5000 });
  await tid("qp-price").locator("input").fill("6.50");
  await tid("qp-save").getByRole("button").click();
  await sheetGone(p);
  await tid("gpr-found-labor.install.story1").waitFor({ timeout: 5000 });
  h.expect(await undo(h), "«Отменить» in the toast");
  await tid("gpr-test-labor.install.story1").waitFor({ timeout: 5000 });
  await waitDb((db) => (db.catalog || []).some((x) => x.attributes && x.attributes.work === "install" && x.attributes.story === "1" && x.placeholder && x.priceCents !== 650),
    "«Отменить» brings the sample price back");

  // close with something typed: the question, «Не сохранять» — the price stays
  const before = (await byAttrs((a) => a.work === "install" && a.story === "1")).priceCents;
  await tid("gpr-test-labor.install.story1").click();
  await tid("qp-sheet").waitFor({ timeout: 5000 });
  await tid("qp-price").locator("input").fill("9.99");
  h.expect((await tid("qp-open").count()) === 0, "once something is typed, «Открыть позицию» is not offered");
  await tid("sheet-close").click();
  await h.expectText(/Сохранить изменения\?/, "unsaved question on close");
  await p.getByRole("button", { name: "Не сохранять" }).locator("visible=true").click();
  await sheetGone(p);
  h.expect((await byAttrs((a) => a.work === "install" && a.story === "1")).priceCents === before, "«Не сохранять» keeps the price");

  // a tech reads only: no sheet
  await h.seed("octo.role.v1", "tech");
  await h.go("/module/gutters/prices");
  await tid("gpr-screen").waitFor({ timeout: 5000 });
  await tid("gpr-ro").waitFor({ timeout: 5000 });
  await tid(`gpr-test-${mat2}`).click();
  await sheetGone(p);
  h.expect((await tid("qp-sheet").count()) === 0, "a tech opens no price sheet");
};
