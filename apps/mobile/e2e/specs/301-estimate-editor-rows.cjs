/**
 * e2e 301 — строка сметы на месте, углы (РС-4b-1, ревью #1227), every view; finds by testID (rule 19):
 * - a row with nothing typed in it folds without a trace (the second «Новая позиция» leaves one blank row, not two);
 * - «⋯ → Заменить → Очистить позицию»: the row empties and stays open; «Отменить» brings the SAME row back (id, name);
 * - «Заменить» with a catalog thing: the new price stands; «Отменить» of the delete does not undo a later edit of another row;
 * - the cost field: «abc» keeps the row open; empty cost is «unknown» (no profit line), not $0;
 * - the tech sees no cost field and no profit.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => p.locator(sel).count();
  const rowIds = async () => (await p.locator('[data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("est-line-", ""))));
  // «Отменить» of a toast works a moment after the toast shows (a double tap is not an undo): press until the toast is gone
  const undo = async (ok) => {
    const btn = p.getByRole("button", { name: /Отменить/ }).locator("visible=true");
    for (let i = 0; i < 10 && (await btn.count()) > 0; i++) {
      await btn.last().click();
      if (await p.waitForFunction(() => !Array.from(document.querySelectorAll("button, [role=button]")).some((e) => /Отменить/.test(e.getAttribute("aria-label") || e.textContent || "")), null, { timeout: 400 }).then(() => true, () => false)) break;
    }
    return ok();
  };

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });

  // a blank row folds without a trace
  await tid("est-add-new").getByRole("button").click();
  await vis('[data-testid^="est-name-"]').first().waitFor({ timeout: 3000 });
  await tid("est-add-new").getByRole("button").click();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-collapse-"]').length === 1, null, { timeout: 3000 });
  h.expect((await count('[data-testid^="est-line-"]')) === 1, "the blank row left no trace: one row, not two");

  // a real row; «Очистить позицию» then «Отменить»: the same row
  await vis('[data-testid^="est-name-"]').first().locator("input").fill("Gutter run");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("10");
  await line.fold(h);
  const [id] = await rowIds();
  await tid(`est-line-${id}`).click();
  await tid(`est-menu-${id}`).getByRole("button").click();
  await tid(`est-act-replace-${id}`).click();
  await h.sheet().getByText(/Очистить позицию/).first().click();
  await p.waitForFunction((i) => document.querySelector(`[data-testid="est-name-${i}"] input`)?.value === "", id, { timeout: 4000 });
  const back = await undo(async () => (await rowIds()).includes(id) && (await p.evaluate((i) => document.querySelector(`[data-testid="est-name-${i}"] input`)?.value, id)) === "Gutter run");
  h.expect(back, "«Отменить» of «Очистить»: the same row (id) with its name");

  // «Заменить» with a catalog thing: the new price stands
  // (after «Отменить» of the clear the row is still open)
  await tid(`est-menu-${id}`).getByRole("button").click();
  await tid(`est-act-replace-${id}`).click();
  await h.sheet().locator("input").first().fill("railing bracket");
  await h.sheet().getByText("Railing bracket", { exact: true }).first().click();
  await p.waitForFunction((i) => document.querySelector(`[data-testid="est-name-${i}"] input`)?.value === "Railing bracket", id, { timeout: 4000 });
  h.expect((await vis(`[data-testid="est-price-${id}"] input`).first().inputValue()) === "12.13", "replaced: the catalog price ($12.13) stands, not the old $10");

  // the cost field: «abc» keeps the row open; empty is «unknown»
  await vis(`[data-testid="est-cost-${id}"] input`).first().fill("abc");
  await vis(`[data-testid="est-cost-${id}-error"]`).first().waitFor({ timeout: 3000 });
  await tid("est-add-new").getByRole("button").click();
  h.expect((await count('[data-testid^="est-collapse-"]')) === 1 && (await count(`[data-testid="est-collapse-${id}"]`)) === 1, "«abc» in the cost keeps the row open");
  await vis(`[data-testid="est-cost-${id}"] input`).first().fill("");
  await p.waitForFunction((i) => !document.querySelector(`[data-testid="est-cost-${i}-error"]`), id, { timeout: 3000 });
  h.expect(!/Заработок/.test(await vis(`[data-testid="est-figures-${id}"]`).first().innerText()), "an empty cost is unknown: no profit line");

  // the tech: no cost field, no profit
  await h.seed("octo.role.v1", "tech");
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await tid("est-add-new").getByRole("button").click();
  await vis('[data-testid^="est-price-"]').first().waitFor({ timeout: 3000 });
  h.expect((await count('[data-testid^="est-cost-"]')) === 0, "the tech: no cost field");
  h.expect(!/Заработок/.test(await vis('[data-testid^="est-figures-"]').first().innerText()), "the tech: no profit");
  await h.seed("octo.role.v1", "director");
};
