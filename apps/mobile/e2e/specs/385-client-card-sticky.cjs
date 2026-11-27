/**
 * e2e 385 — the client's card in the v2 Object template (#2350; was PR-3 #1416, #1343), Sarah Mitchell (c1) as the director,
 * every view, by testID:
 * - the sections strip «chips» (v2 макет 3): every pill has its plate, the selected one its own (lighter) fill;
 * - scrolled down, the strip sticks to the top under the one header's row, and the header folds: «＋» leaves the row and its items
 *   go to the top of «⋯» (ObjectScreen `ObjectRight`); another section keeps the strip stuck (no jump back to the page's top);
 * - «Журнал»: no filter strip under the sections (#2350 «не больше одного ряда чипов»);
 * - «Обзор»: the visits ahead are their own rows.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const S = "client-screen";
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();

  await h.go("/client/c1");
  await tid(`${S}-sections`).waitFor({ timeout: 8000 });

  // every pill has a plate; the selected one's differs from the others'
  const plates = await p.evaluate((S) => {
    const row = [...document.querySelectorAll(`[data-testid="${S}-sections"]`)].find((e) => e.offsetParent !== null);
    const tabs = [...(row?.querySelectorAll('[role="tab"]') ?? [])];
    const bg = (t) => [t, ...t.querySelectorAll("div")].map((e) => getComputedStyle(e).backgroundColor).find((x) => x !== "rgba(0, 0, 0, 0)" && x !== "transparent") ?? null;
    return tabs.map((t) => ({ sel: t.getAttribute("aria-selected") === "true", bg: bg(t) }));
  }, S);
  h.expect(plates.length >= 5, `the sections are there (${plates.length})`);
  h.expect(plates.every((x) => x.bg), `every pill has its plate (${JSON.stringify(plates)})`);
  const selBg = plates.find((x) => x.sel)?.bg;
  h.expect(selBg && plates.filter((x) => !x.sel).every((x) => x.bg !== selBg), `the selected pill has its own fill (${JSON.stringify(plates)})`);

  // «Обзор»: the visits ahead, each its own row
  // #3061/#3068: the visits ahead are their own group «Впереди» (the pinned note and the access moved to «Объекты» / «Журнал»)
  await tid("client-ahead").waitFor({ timeout: 3000 });
  h.expect((await p.locator('[data-testid^="client-ahead-v"]').locator("visible=true").count()) >= 1, "a visit ahead is a row of its own");

  // «Журнал» is long: scroll down with the wheel (a finger's scroll) — the strip sticks, the header folds
  await p.getByTestId(`${S}-sections-log`).locator("visible=true").first().click();
  await tid("client-log").waitFor({ timeout: 4000 });
  h.expect((await p.getByTestId("client-log").locator("visible=true").first().locator('[data-testid="filter-bar"], [role="radio"]').count()) === 0, "«Журнал»: no filter strip under the sections");
  h.expect((await p.getByTestId(`${S}-create`).locator("visible=true").count()) === 1, "«＋» in the row before the fold");
  await p.mouse.move(h.layout.width / 2, 500);
  await p.mouse.wheel(0, 900);
  const stuck = () =>
    p.waitForFunction((S) => {
      const t = [...document.querySelectorAll(`[data-testid="${S}-sections"]`)].find((e) => e.offsetParent !== null);
      return t && t.getBoundingClientRect().top < 140 && t.getBoundingClientRect().top >= 0;
    }, S, { timeout: 3000 });
  await stuck();
  await p.getByTestId(`${S}-create`).locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
  await h.shot("stuck");
  // folded: «＋»'s items are on the top of «⋯»
  await tid(`${S}-more`).getByRole("button").first().click();
  await tid("menu-items").waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("client-create-task").locator("visible=true").count()) === 1, "folded: «Новая задача» is in «⋯»");
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  // another section: the strip stays stuck
  await tid(`${S}-sections-work`).click();
  await p.locator(`[data-testid="${S}-sections-work"][aria-selected="true"]`).locator("visible=true").first().waitFor({ timeout: 3000 });
  await stuck();
};
