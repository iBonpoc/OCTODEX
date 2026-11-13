/**
 * e2e 346 — «Варианты для клиента» (DS §8.10, spec 2026-11-12 §11.2.6, #1307 part «г»), every view, by testID:
 * - one option: «Клиент увидит одну смету» and «Добавить вариант»;
 * - «Вариант — копия»: a second option with the same list; a change in the copy does not reach the first;
 * - each option's total under the segments, live; a press on a total picks that option;
 * - «?» — five steps and «Общее для всех»;
 * - the copy is made from the settled list: an open blank row is not copied (code review);
 * - «Ещё → Рекомендовать»: «★ рекомендуем» under its total; on another option — it moves there;
 * - «Ещё → Переименовать»: another option's name is refused, a new one is on the segment;
 * - at three the copy is pale and says «Не больше трёх вариантов»;
 * - «Ещё → Удалить»: that option goes; «Вернуть» puts it back at its place with its list and total.
 */
const { sheetGone } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const count = (sel) => vis(sel).count();
  const totals = async () => (await vis('[data-testid^="est-var-total-"]').evaluateAll((els) => els.map((e) => (e.textContent || "").replace(/\s+/g, " ").trim())));
  const totalIds = async () => (await vis('[data-testid^="est-var-total-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("est-var-total-", ""))));
  const toastSays = (re) => p.waitForFunction((src) => [...document.querySelectorAll('[data-testid="toast-text"]')].some((e) => new RegExp(src).test(e.textContent || "")), re.source, { timeout: 3000 });

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-variants").waitFor({ timeout: 8000 });
  // one option: a line and «Добавить вариант», no segments
  h.expect(/Клиент увидит одну смету/.test(await tid("est-variants").innerText()), "one option: «Клиент увидит одну смету»");
  h.expect((await count('[data-testid^="est-var-total-"]')) === 0, "one option: no totals under segments");
  await line.addCustom(h, "Gutter clean (тестовые)", 100);
  await h.shot("one");

  // «Добавить вариант» with a blank row open: the row goes, the copy has only the real line
  await tid("est-add-new").getByRole("button").click();
  await vis('[data-testid^="est-collapse-"]').first().waitFor({ timeout: 3000 });
  await tid("est-var-add").getByRole("button").click();
  await tid("est-var-copy").waitFor({ timeout: 3000 });
  await toastSays(/копия/);
  h.expect((await count('[data-testid^="est-line-"]')) === 1, "the copy has the same one line");
  const [good, better] = await totalIds();
  h.expect(!!good && !!better, "two totals under the segments");
  h.expect((await totals()).every((x) => /\$100\b/.test(x)), `both totals $100 (${await totals()})`);
  h.expect(/Вы правите «Better»/.test(await tid("est-variants").innerText()), "the copy «Better» is the one edited");

  // a change in the copy: its total changes while typing, the first stays
  await vis('[data-testid^="est-line-"]').first().click();
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("150");
  await p.waitForFunction((id) => /\$150\b/.test(document.querySelector(`[data-testid="est-var-total-${id}"]`)?.textContent || ""), better, { timeout: 3000 });
  h.expect(/\$100\b/.test(await tid(`est-var-total-${good}`).innerText()), "the first option's total stays $100");
  await line.fold(h);
  await h.shot("two");

  // a press on a total picks that option: its own list, $100
  await tid(`est-var-total-${good}`).click();
  await p.waitForFunction(() => /Вы правите «Good»/.test(document.querySelector('[data-testid="est-variants"]')?.textContent || ""), null, { timeout: 3000 });
  const sum = await vis('[data-testid^="est-sum-"]').first().innerText();
  h.expect(/\$100\b/.test(sum), `«Good» keeps $100 (${sum})`);
  h.expect((await count('[data-testid^="est-line-"]')) === 1, "«Good» has one line (the blank row did not stay)");

  // «?» — five steps and what is shared
  await tid("est-var-help").getByRole("button").click();
  await tid("est-var-help-sheet").waitFor({ timeout: 3000 });
  for (const n of [1, 2, 3, 4, 5]) h.expect((await count(`[data-testid="est-var-step-${n}"]`)) === 1, `«?» step ${n}`);
  h.expect(/скидка, налог/.test(await tid("est-var-common").innerText()), "«Общее для всех»");
  await h.shot("help");
  // «Понятно» closes it
  await tid("est-var-help-sheet").getByRole("button").last().click();
  await sheetGone(p);

  // «Ещё → Рекомендовать «Good»»: «★ рекомендуем» under its total
  await tid("est-var-more").getByRole("button").click();
  await tid("est-var-act-recommend").click();
  await sheetGone(p);
  await tid(`est-var-rec-${good}`).waitFor({ timeout: 3000 });
  h.expect((await count(`[data-testid="est-var-rec-${better}"]`)) === 0, "one recommended");
  // on «Better» — the mark moves there
  await tid(`est-var-total-${better}`).click();
  await p.waitForFunction(() => /Вы правите «Better»/.test(document.querySelector('[data-testid="est-variants"]')?.textContent || ""), null, { timeout: 3000 });
  await tid("est-var-more").getByRole("button").click();
  await tid("est-var-act-recommend").click();
  await sheetGone(p);
  await tid(`est-var-rec-${better}`).waitFor({ timeout: 3000 });
  h.expect((await count(`[data-testid="est-var-rec-${good}"]`)) === 0, "the mark moved from «Good» to «Better»");

  // «Ещё → Переименовать»: «Good» is taken; «Premium» is on the segment
  await tid("est-var-more").getByRole("button").click();
  await tid("est-var-act-rename").click();
  const nameField = tid("est-var-rename").locator("input");
  await nameField.waitFor({ timeout: 3000 });
  await nameField.fill("good");
  await tid("est-var-rename-done").getByRole("button").click();
  await toastSays(/уже есть/);
  await nameField.fill("Premium");
  await tid("est-var-rename-done").getByRole("button").click();
  await sheetGone(p);
  await p.waitForFunction(() => /Вы правите «Premium»/.test(document.querySelector('[data-testid="est-variants"]')?.textContent || ""), null, { timeout: 3000 });
  h.expect((await count(`[data-testid="est-var-seg-${better}"]`)) === 1 && /Premium/.test(await tid(`est-var-seg-${better}`).innerText()), "the new name is on the segment");

  // a third copy (of «Premium», $150); at three the copy is pale and says why
  await tid("est-var-copy").getByRole("button").click();
  await tid("est-var-copy-max").waitFor({ timeout: 3000 });
  const ids3 = await totalIds();
  h.expect(ids3.length === 3, "three options");
  const third = ids3.find((x) => x !== good && x !== better);
  h.expect((await count('[data-testid^="est-var-rec-"]')) === 1, "the copy does not take «recommended»");
  await tid("est-var-copy-max").click();
  await toastSays(/Не больше трёх/);
  await h.shot("three");

  // «Ещё → Удалить» on «Premium» (the middle one): it goes, «Good» and the third stay
  await tid(`est-var-total-${better}`).click();
  await p.waitForFunction(() => /Вы правите «Premium»/.test(document.querySelector('[data-testid="est-variants"]')?.textContent || ""), null, { timeout: 3000 });
  await tid("est-var-more").getByRole("button").click();
  await tid("est-var-act-delete").click();
  await sheetGone(p);
  await p.waitForFunction((id) => !document.querySelector(`[data-testid="est-var-total-${id}"]`), better, { timeout: 3000 });
  h.expect(JSON.stringify(await totalIds()) === JSON.stringify([good, third]), "«Premium» went, the others stay");
  // «Вернуть»: back in the middle, with its $150 and the mark, and it is the one edited again
  h.expect(await line.undo(h), "«Вернуть» pressed");
  await tid(`est-var-total-${better}`).waitFor({ timeout: 3000 });
  h.expect(JSON.stringify(await totalIds()) === JSON.stringify([good, better, third]), "back at its place");
  h.expect(/\$150\b/.test(await tid(`est-var-total-${better}`).innerText()), "with its total");
  h.expect((await count(`[data-testid="est-var-rec-${better}"]`)) === 1, "with its mark");
  await p.waitForFunction(() => /Вы правите «Premium»/.test(document.querySelector('[data-testid="est-variants"]')?.textContent || ""), null, { timeout: 3000 });
};
