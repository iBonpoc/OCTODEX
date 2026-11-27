/**
 * The line's «⋯» menu and the trash (wave 1 tail: #2448, #2449, #2450), every view:
 * - the long-press menu of a line shows every item whole — «Удалить» included — wherever the line stands on the screen (390: it was
 *   cut at its bottom, the list scrolled behind 6½ rows);
 * - the open line's trash has a 44 × 44 zone (rule 3);
 * - «Выше / Ниже» are not two items of the menu (the «Переместить» sheet has them), and «Переместить» has not the icon of «Отправить».
 */
const line = require("../estimateLine.cjs");
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (sel) => p.locator(sel).locator("visible=true").first();
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await vis('[data-testid="est-add-new"]').waitFor({ timeout: 8000 });
  for (const n of ["A line", "B line", "C line", "D line", "E line", "F line", "G line"]) await line.addCustom(h, n, 10, 1);
  const ids = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="est-line-"]')].map((e) => e.getAttribute("data-testid").replace("est-line-", "")));
  h.expect(ids.length === 7, `seven lines (${ids.length})`);

  // #2448 / #2450: the menu of each line, from the first to the last (the lower lines stand near the bottom of the window)
  const iconOf = (id, act) => p.evaluate(([i, a]) => {
    const el = document.querySelector(`[data-testid="est-act-${a}-${i}"]`);
    return el ? [...el.querySelectorAll("svg path")].map((x) => x.getAttribute("d")).join("|") : null;
  }, [id, act]);
  let sendIcon = null;
  for (const id of ids) {
    await vis(`[data-testid="est-line-${id}"]`).scrollIntoViewIfNeeded();
    await line.menu(h, id);
    const r = await p.evaluate((i) => {
      const box = document.querySelector('[data-testid="menu-items"]').getBoundingClientRect();
      const it = (a) => document.querySelector(`[data-testid="est-act-${a}-${i}"]`);
      const b = it("delete") && it("delete").getBoundingClientRect();
      return {
        vh: innerHeight,
        box: [Math.round(box.top), Math.round(box.bottom)],
        del: b ? [Math.round(b.top), Math.round(b.bottom)] : null,
        scroll: document.querySelector('[data-testid="menu-items"]').scrollHeight - document.querySelector('[data-testid="menu-items"]').clientHeight,
        shifts: !!(it("up") || it("down")),
      };
    }, id);
    h.expect(r.del && r.del[0] >= r.box[0] && r.del[1] <= r.box[1] + 1 && r.del[1] <= r.vh, `«Удалить» is whole in the menu and in the window (${JSON.stringify(r)})`);
    h.expect(r.scroll <= 1, `the menu does not scroll: every item is on show (${r.scroll} px hidden)`);
    h.expect(!r.shifts, "«Выше» / «Ниже» are not items of the menu (the «Переместить» sheet has them)");
    if (id === ids[0]) {
      const mv = await iconOf(id, "move");
      // #2935: «Отправить» is a button by its words at the bottom now (no ➤ on the screen) — the icon «send» of the tokens
      // (packages/design-tokens/src/icons.ts) is compared instead
      sendIcon = "M20.5 3.5 3.5 10.5l7 3 3 7ZM20.5 3.5l-10 10";
      h.expect(!!mv && !mv.includes(sendIcon), "«Переместить» has not the icon of «Отправить»");
      await h.shot("menu");
    }
    await pressEscUntilClosed(p, vis('[data-testid="menu-items"]'));
  }

  // #2449: the open line's trash
  await vis(`[data-testid="est-line-${ids[0]}"]`).scrollIntoViewIfNeeded();
  await vis(`[data-testid="est-line-${ids[0]}"]`).click();
  await vis(`[data-testid="est-trash-${ids[0]}"]`).waitFor({ timeout: 3000 });
  const z = await p.evaluate((i) => {
    const btn = document.querySelector(`[data-testid="est-trash-${i}"] [role="button"], [data-testid="est-trash-${i}"] button`);
    const r = btn.getBoundingClientRect();
    return [Math.round(r.width), Math.round(r.height)];
  }, ids[0]);
  h.expect(z[0] >= 44 && z[1] >= 44, `the trash zone is at least 44 × 44 (${z.join(" × ")})`);
  await h.shot("trash");
};
