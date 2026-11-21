/**
 * «Сметы» and «Счета» — the List template of prototype v2 (#2350, wave 3 Э5): grouped rows (`est-row-<id>`, `invoice-row-<id>`);
 * a tap opens the card's own screen at every width, the list's address (`?f=`) stays for «back». The 1280 panel beside the list
 * (docs/specs/06-list-cards.md «Панель 1280», e2e 155 keeps it for «Клиенты») left these two lists with the template; an old
 * link with `?open=<id>` opens the card's own screen. The technician sees no margin in an estimate.
 */
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);

async function check(h, { list, rowId, card, query = "" }) {
  const p = h.page;
  await h.go(list + query);
  const rows = p.locator(`[data-testid^="${rowId}-"]`).locator("visible=true");
  await rows.first().waitFor({ timeout: 8000 });
  h.expect((await rows.count()) >= 2, `${list}: two rows at least (${await rows.count()})`);
  const id0 = (await rows.first().getAttribute("data-testid")).slice(rowId.length + 1);
  await rows.first().click();
  await p.waitForURL(new RegExp(`${card}/${id0}$`), { timeout: 5000 });
  h.expect((await p.getByTestId("list-panel").locator("visible=true").count()) === 0, `${list} @${h.layout.width}: the card's own screen, no panel`);
  // «back» — the list with its own address
  await p.goBack();
  await p.waitForURL((u) => u.pathname === list && [...new URLSearchParams(query.slice(1))].every(([k, v]) => u.searchParams.get(k) === v), { timeout: 5000 });
  h.expect(true, `${list}: «back» keeps the list's address ${query}`);
}

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await role(h, "director");
  await check(h, { list: "/estimates", rowId: "est-row", card: "/estimate" });
  await check(h, { list: "/invoice", rowId: "invoice-row", card: "/invoice", query: "?f=all" });
  const db = await h.db();

  // an old link with ?open= (also to a card the default filter hides — an approved estimate, a paid invoice): the card's screen
  const done = db.estimates.find((e) => e.status === "approved" || e.status === "declined");
  h.expect(done, "demo has a closed estimate");
  await h.go(`/estimates?open=${done.id}`);
  await p.waitForURL(new RegExp(`/estimate/${done.id}$`), { timeout: 5000 });
  const paid = db.invoices.find((i) => i.paidCents >= i.totalCents && !i.void);
  h.expect(paid, "demo has a paid invoice");
  await h.go(`/invoice?open=${paid.id}`);
  await p.waitForURL(new RegExp(`/invoice/${paid.id}$`), { timeout: 5000 });
  await p.getByTestId("invoice-screen").locator("visible=true").first().waitFor({ timeout: 8000 });

  // the margin: the director sees it on the estimate's screen; the technician does not
  let withMargin;
  for (const e of db.estimates) {
    await h.go(`/estimate/${e.id}`);
    await p.locator('[data-testid="estimate-screen"], [data-testid="no-access"]').locator("visible=true").first().waitFor({ timeout: 8000 });
    if (await p.locator('[data-testid^="est-margin"]:visible').count()) { withMargin = e; break; }
  }
  h.expect(withMargin, "demo has an estimate with a margin line (counted or «не посчитана») for the director");
  await h.shot("estimate-margin");

  await role(h, "tech");
  await h.go(`/estimates?open=${withMargin.id}`);
  await p.waitForURL(new RegExp(`/estimate/${withMargin.id}$`), { timeout: 5000 });
  await p.locator('[data-testid="estimate-screen"], [data-testid="no-access"]').locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.locator('[data-testid^="est-margin"]').count()) === 0, "technician: no margin in the estimate");
  h.expect(!/Маржа/.test(await p.locator("body").innerText()), "technician: no «Маржа» text");
  await h.shot("estimate-tech");
};
