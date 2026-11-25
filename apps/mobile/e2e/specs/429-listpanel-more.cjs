/**
 * e2e 429 — «⋯» of the card in the panel beside the list (#1495, DS Б10 + Б4), the director, 1280 (the panel is only there):
 * the estimate's and the invoice's «⋯» stand in the header's right cluster in one row with «Открыть» and «✕» —
 * right of «Открыть», left of «✕» — and there is no row of actions under the title; the menu opens;
 * the client's «Изменить» stays in its row under the title.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  if (h.layout.width < 1280) return;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  for (const list of ["/estimates?open=e6", "/invoice?open=i1"]) {
    await h.go(list);
    await tid("list-panel").waitFor({ timeout: 8000 });
    const open = await tid("list-panel-open").boundingBox();
    const more = await tid("list-panel-more").boundingBox();
    const close = await tid("list-panel-close").boundingBox();
    h.expect(Math.abs(more.y - open.y) < 20 && Math.abs(more.y - close.y) < 20, `${list}: «⋯» is in the header row (${Math.round(more.y)} vs ${Math.round(open.y)})`);
    h.expect(more.x > open.x && more.x < close.x, `${list}: «⋯» is between «Открыть» and «✕»`);
    h.expect((await p.getByTestId("list-panel-actions").locator("visible=true").count()) === 0, `${list}: no row of actions under the title`);
    await h.shot(list.slice(1, 5));
    await tid("list-panel-more").getByRole("button").click();
    await tid("menu-items").waitFor({ timeout: 4000 });
    await pressEscUntilClosed(p);
  }
  // the client keeps «Изменить» under the title
  await h.go("/clients?open=c1");
  await tid("list-panel").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("list-panel-actions").locator("visible=true").count()) === 1, "the client panel: «Изменить» stays in its row under the title");
};
