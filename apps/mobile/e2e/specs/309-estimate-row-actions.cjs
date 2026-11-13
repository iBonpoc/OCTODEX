/**
 * e2e 309 — the actions of a FOLDED estimate row on the web: «⋯» next to the row (the web has no swipe), the same list the swipe
 * and the screen reader use (РС-7c2, DS Б13, спека Р2), every view; by testID:
 * - «⋯» is on a folded row and there are no swipe buttons on the web;
 * - «Скрыть» with a price is refused with the reason (nothing changes); at $0 it hides, the row carries «Скрыта»; «Показать» brings it back;
 * - «Дублировать» adds a copy; «Удалить» removes the row WITHOUT a question and the toast takes it back.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => p.locator(sel).count();
  const rows = () => p.locator('[data-testid^="est-line-"]').locator("visible=true").count();
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });

  await line.addCustom(h, "Courtesy check (тестовые)", 25);
  const id = (await vis('[data-testid^="est-line-"]').first().getAttribute("data-testid")).replace("est-line-", "");
  await tid(`est-menu-${id}`).waitFor({ timeout: 3000 });
  h.expect((await count('[data-testid^="est-swipe-"]')) === 0, "the web has no swipe buttons");

  // a priced line is not hidden: the reason, nothing changes
  await tid(`est-menu-${id}`).getByRole("button").click();
  h.expect(
    (await tid(`est-act-hide-${id}`).evaluate((el) => Math.min(...[el, ...el.querySelectorAll("*")].map((n) => Number(getComputedStyle(n).opacity))))) < 1,
    "«Скрыть» of a priced line is pale in «⋯»",
  );
  await tid(`est-act-hide-${id}`).click();
  await p.getByText(/ценой \$0/).first().waitFor({ timeout: 3000 });
  h.expect((await count(`[data-testid="est-hidden-${id}"]`)) === 0, "a priced line stays visible to the client");

  // at $0 it hides and shows again
  await tid(`est-line-${id}`).click();
  await vis(`[data-testid="est-price-${id}"] input`).first().fill("0");
  await line.fold(h);
  await tid(`est-menu-${id}`).getByRole("button").click();
  await tid(`est-act-hide-${id}`).click();
  await tid(`est-hidden-${id}`).waitFor({ timeout: 3000 });
  await tid(`est-menu-${id}`).getByRole("button").click();
  h.expect((await count(`[data-testid="est-act-hide-${id}"]`)) === 0, "a hidden line offers «Показать», not «Скрыть»");
  await tid(`est-act-show-${id}`).click();
  await p.waitForFunction((i) => document.querySelectorAll(`[data-testid="est-hidden-${i}"]`).length === 0, id, { timeout: 3000 });

  // «Дублировать», then «Удалить» with no question and «Отменить»
  const n0 = await rows();
  await tid(`est-menu-${id}`).getByRole("button").click();
  await tid(`est-act-duplicate-${id}`).click();
  await p.waitForFunction((n) => document.querySelectorAll('[data-testid^="est-line-"]').length >= n + 1, n0, { timeout: 3000 });
  const n1 = await rows();
  await tid(`est-menu-${id}`).getByRole("button").click();
  await tid(`est-act-delete-${id}`).click();
  await p.waitForFunction((n) => document.querySelectorAll('[data-testid^="est-line-"]').length === n - 1, n1, { timeout: 3000 });
  h.expect(await line.undo(h), "«Отменить»: the deleted row is back");
  h.expect((await rows()) === n1, "the row is back after «Отменить»");
};
