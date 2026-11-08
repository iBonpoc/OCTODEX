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
async function rows(h, list) {
  const cards = h.page.locator('[data-testid="list-card"]:visible');
  await cards.first().waitFor();
  const n = await cards.count();
  h.expect(n >= 2, `${list}: two rows at least (${n})`);
  return cards;
}

async function check(h, { list, card, query = "" }) {
  const p = h.page;
  const desk = h.layout.width >= 1280;
  await h.go(list + query);
  const cards = await rows(h, list);
  const keep = new URLSearchParams(query.slice(1));
  // the list's own address (?f=, ?customer=) stays with ?open= through open, ↓ and Esc
  const kept = () => [...keep].every(([k, v]) => new URLSearchParams(new URL(h.page.url()).search).get(k) === v);
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
  h.expect(kept(), `${list}: ?f= kept with ?open= (${p.url()})`);
  await p.keyboard.press("Escape");
  h.expect(await openIs(h, ""), `${list}: Esc closes the panel (${p.url()})`);
  h.expect(kept(), `${list}: ?f= kept after Esc (${p.url()})`);
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
  await check(h, { list: "/invoice", card: "/invoice", query: "?f=all" });
  const db = await h.db();

  // narrow window + a link with ?open=: the card's own screen
  if (h.layout.width < 1280) {
    const e = db.estimates[0];
    await h.go(`/estimates?open=${e.id}`);
    await p.waitForURL(new RegExp(`/estimate/${e.id}$`));
    const i = db.invoices[0];
    await h.go(`/invoice?open=${i.id}`);
    await p.waitForURL(new RegExp(`/invoice/${i.id}$`));
    return;
  }

  // a link to a card the default filter hides (an approved estimate, a paid invoice): the panel still opens —
  // the same as after signing or a payment in the panel itself (review #426)
  const done = db.estimates.find((e) => e.status === "approved" || e.status === "declined");
  h.expect(done, "demo has a closed estimate");
  await h.go(`/estimates?open=${done.id}`);
  await panel(h).waitFor();
  h.expect(await openIs(h, done.id), `a closed estimate opens in the panel (${p.url()})`);
  const paid = db.invoices.find((i) => i.paidCents >= i.totalCents && !i.void);
  h.expect(paid, "demo has a paid invoice");
  await h.go(`/invoice?open=${paid.id}`);
  await panel(h).waitFor();
  h.expect(await openIs(h, paid.id), `a paid invoice opens in the panel (${p.url()})`);

  // the margin: the director sees it in the panel where the estimate's screen shows it; the technician does not
  let withMargin;
  for (const e of db.estimates) {
    await h.go(`/estimate/${e.id}`);
    if (await p.locator('[data-testid^="est-margin"]:visible').count()) { withMargin = e; break; }
  }
  h.expect(withMargin, "demo has an estimate with a margin line (counted or «не посчитана») for the director");
  await h.go(`/estimates?open=${withMargin.id}`);
  await panel(h).locator('[data-testid^="est-margin"]').first().waitFor();

  // the technician: the estimate in the panel shows no margin, as on its screen
  await role(h, "tech");
  await h.go(`/estimates?open=${withMargin.id}`);
  await panel(h).waitFor();
  h.expect((await panel(h).locator('[data-testid^="est-margin"]').count()) === 0, "technician: no margin in the estimate panel");
  h.expect(!/Маржа/.test(await panel(h).innerText()), "technician: no «Маржа» text in the panel");
  await h.shot("estimates-panel-tech");
};
