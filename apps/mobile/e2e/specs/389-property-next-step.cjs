/**
 * e2e 389 — the property's card: one next step and tiles instead of a row of three buttons (#1474, as the job's card; DS §7.3,
 * §12.3), every view, by testID:
 * - the office: «Записать на оценку» stands under the tiles, as the client's step (full width on a phone, as wide as its words
 *   from 820), is not yellow while the screen has its «＋» (one yellow, rule 2), and opens the sheet with the same words;
 * - Маршрут · Клиент are round tiles in one line in the address card, each a 44 tap zone; «Клиент» opens the client;
 * - the technician: no «Записать на оценку» (the tiles stay).
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const phone = h.layout.width < 820;

  await h.go("/property/p1");
  await tid("prop-main").waitFor({ timeout: 8000 });
  h.expect((await tid("prop-main").innerText()).includes("Записать на оценку"), "the office: the card's step is «Записать на оценку»");
  const bg = await tid("prop-main").getByRole("button").evaluate((e) => {
    const all = [e, ...e.querySelectorAll("*")].map((x) => getComputedStyle(x).backgroundColor);
    return all.join(" ");
  });
  h.expect(!/rgb\(251, 255, 0\)/.test(bg), `not yellow: the screen's one yellow is its «＋» (${bg.slice(0, 80)})`);
  const main = await tid("prop-main").boundingBox();
  const vp = p.viewportSize();
  if (phone) h.expect(main && main.width > vp.width * 0.8, `on a phone the main step is full width (${main && main.width})`);
  else h.expect(main && main.width < 400, `from 820 the main step is as wide as its words (${main && main.width})`);
  // no row of buttons left: «Маршрут» and the client are tiles
  h.expect((await p.getByRole("button", { name: /›$/ }).locator("visible=true").count()) === 0, "no «<client> ›» button");
  const route = await tid("prop-route").boundingBox();
  const client = await tid("prop-client").boundingBox();
  h.expect(route && client && Math.abs(route.y - client.y) <= 2, "Маршрут · Клиент in one line");
  h.expect(route.height >= 44 && client.height >= 44, "each tile is a 44 tap zone");
  h.expect(main.y > route.y, "the step stands under the tiles, as on the client's card");
  await h.shot("card");

  // «Записать на оценку» opens the inspection sheet
  await tid("prop-main").getByRole("button").click();
  // one word for one action (DS §4.4): the sheet is called as the button
  const sheet = p.locator('[aria-modal="true"]').filter({ hasText: "Записать на оценку" }).last();
  await sheet.waitFor({ timeout: 4000 });
  await h.shot("sheet");
  await pressEscUntilClosed(p, sheet);

  // «Клиент» opens the client
  await tid("prop-client").click();
  await p.waitForURL(/\/client\/c1$/, { timeout: 5000 });

  // the technician: no next step here, the tiles stay
  await h.seed("octo.role.v1", "tech");
  await h.go("/property/p1");
  await tid("prop-route").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("prop-main").locator("visible=true").count()) === 0, "the technician: no «Записать на оценку»");
};
