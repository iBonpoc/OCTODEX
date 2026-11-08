/**
 * The open card beside the list on 1280 for «Сметы» and «Счета» (docs/specs/06-list-cards.md «Панель 1280»;
 * nav/listPanel.ts useListPanel; the same as «Клиенты», e2e 155).
 * 1280: a tap opens the estimate / invoice on the right, the list stays (`?open=<id>`, the invoice list keeps its `?f=`);
 * ↓ — the next row, Esc closes, «Открыть» — the card's own screen, the link opens the panel after a reload.
 * The panel draws the same body as the card's screen: the technician sees no margin in an estimate.
 * 390/820: no panel — a tap opens the card's screen, a link with ?open= goes to that screen.
 */
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);
const panel = (h) => h.page.getByTestId("list-panel").locator("visible=true");
const openIs = (h, id) => h.page.waitForFunction((w) => (new URLSearchParams(location.search).get("open") ?? "") === w, id, { timeout: 4000 }).then(() => true, () => false);

/** the first two rows of a list, as ids (a row's label starts with the client's name; the ids come from the db in order) */
async function rows(h, list, label) {
  const cards = h.page.locator('[data-testid="list-card"]:visible');
  await cards.first().waitFor();
  const n = await cards.count();
  h.expect(n >= 2, `${list}: two rows at least (${n})`);
  return cards;
}

async function check(h, { list, card, label }) {
  const p = h.page;
  const desk = h.layout.width >= 1280;
  await h.go(list);
  const cards = await rows(h, list, label);
  if (!desk) {
    await cards.first().click();
    await p.waitForURL(new RegExp(`${card}/[\\w-]+$`));
    h.expect((await panel(h).count()) === 0, `${list} @${h.layout.width}: no panel, the card's own screen`);
    return;
  }
  await cards.first().click();
  await panel(h).waitFor();
  const id0 = new URLSearchParams(new URL(p.url()).search).get("open");
  h.expect(!!id0 && new URL(p.url()).pathname === list, `${list}: a tap opens the panel, the list stays (${p.url()})`);
  h.expect((await cards.first().getAttribute("aria-current")) === "true", `${list}: the open row is marked`);
  await h.shot(`${list.slice(1)}-panel`);
  await p.keyboard.press("ArrowDown");
  await p.waitForFunction((w) => new URLSearchParams(location.search).get("open") !== w, id0, { timeout: 4000 });
  h.expect((await cards.nth(1).getAttribute("aria-current")) === "true", `${list}: ↓ → the next row`);
  const id1 = new URLSearchParams(new URL(p.url()).search).get("open");
  await p.keyboard.press("Escape");
  h.expect(await openIs(h, ""), `${list}: Esc closes the panel (${p.url()})`);
  // the link after a full reload, then «Открыть»
  await h.go(`${list}?open=${id1}`);
  await panel(h).waitFor();
  await p.getByTestId("list-panel-open").locator("visible=true").click();
  await p.waitForURL(new RegExp(`${card}/${id1}$`));
}

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await role(h, "director");
  await check(h, { list: "/estimates", card: "/estimate" });
  await check(h, { list: "/invoice", card: "/invoice" });

  // narrow window + a link with ?open=: the card's own screen
  if (h.layout.width < 1280) {
    const db = await h.db();
    const e = db.estimates[0];
    await h.go(`/estimates?open=${e.id}`);
    await p.waitForURL(new RegExp(`/estimate/${e.id}$`));
    return;
  }

  // the technician: the estimate in the panel shows no margin, as on its screen
  await role(h, "tech");
  await h.go("/estimates");
  const cards = p.locator('[data-testid="list-card"]:visible');
  await cards.first().waitFor();
  await cards.first().click();
  await panel(h).waitFor();
  h.expect((await panel(h).getByTestId("est-margin").count()) === 0, "technician: no margin in the estimate panel");
  h.expect(!/Маржа/.test(await panel(h).innerText()), "technician: no «Маржа» text in the panel");
  await h.shot("estimates-panel-tech");
};
