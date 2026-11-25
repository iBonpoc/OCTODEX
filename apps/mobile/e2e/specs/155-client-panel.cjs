/**
 * The open card beside the list on 1280 (docs/specs/06-list-cards.md «Панель 1280», 10-nav-wide §1.5; nav/listPanel.ts).
 * 1280: a tap opens the client on the right, the list stays; `/clients?open=<id>`; ↓/↑ — the next / previous client,
 * Esc closes; «Открыть» — the card on its own screen; the link opens the panel after a reload too. The address is
 * replaced, not pushed: «back» leaves the list instead of stepping through the cards shown.
 * The panel draws the client's «Обзор» (v2 #2350, ClientAside): the technician sees no money there (role check).
 * v2: the rows are GroupRow `client-row-<id>` (GroupRow has no «open» mark — the open row is not marked any more).
 * 390/820: no panel — a tap opens the card's screen, and a link with ?open= goes to that screen.
 */
const { escOnPage, pressEscUntilClosed } = require("../sheet.cjs");
const { listChip } = require("../listScreen.cjs");
const role = (h, r) => h.page.evaluate((v) => localStorage.setItem("octo.role.v1", JSON.stringify(v)), r);
const panel = (h) => h.page.getByTestId("list-panel").locator("visible=true");
const openIs = (h, id) => h.page.waitForFunction((w) => (new URLSearchParams(location.search).get("open") ?? "") === w, id, { timeout: 4000 }).then(() => true, () => false);

exports.run = async (h) => {
  const p = h.page;
  const desk = h.layout.width >= 1280;
  await h.go("/today");
  await role(h, "director");
  await h.go("/clients");
  const db = await h.db();
  const ROWS = '[data-testid^="client-row-"]:not([data-testid^="client-row-call-"]):not([data-testid^="client-row-swipe-"]):visible';
  const cards = p.locator(ROWS);
  const rowOf = (id) => p.getByTestId(`client-row-${id}`).locator("visible=true").first();
  await cards.first().waitFor();
  const ids = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").slice("client-row-".length)));
  const [id0, id1] = ids;
  h.expect(id0 && id1, `two clients in the list (${ids.slice(0, 2).join(" | ")})`);
  const name1 = db.customers.find((c) => c.id === id1).name;

  if (!desk) {
    await cards.first().click();
    await p.waitForURL(new RegExp(`/client/${id0}`));
    h.expect((await panel(h).count()) === 0, `${h.layout.width}: no panel, the card's own screen`);
    // a link with ?open= on a narrower window: the card's screen
    await h.go(`/clients?open=${id1}`);
    await p.waitForURL(new RegExp(`/client/${id1}`));
    await p.getByTestId("client-screen").locator("visible=true").first().waitFor();
    h.expect((await p.getByTestId("screen-head-big").locator("visible=true").first().innerText()).includes(name1), `the card of ${name1}`);
    return;
  }

  const startLen = await p.evaluate(() => history.length);
  await cards.first().click();
  h.expect(await openIs(h, id0), `a tap opens the panel (${p.url()})`);
  await panel(h).waitFor();
  h.expect(new URL(p.url()).pathname === "/clients", `the list stays (${p.url()})`);
  await h.shot("panel");

  await p.keyboard.press("ArrowDown");
  h.expect(await openIs(h, id1), `↓ → the next client (${p.url()})`);
  await panel(h).getByText(name1, { exact: true }).first().waitFor();
  await p.keyboard.press("ArrowUp");
  h.expect(await openIs(h, id0), `↑ → back to the first (${p.url()})`);
  h.expect((await p.evaluate(() => history.length)) === startLen, "open, ↓, ↑ replace the address, history does not grow");
  await escOnPage(p);
  h.expect(await openIs(h, ""), `Esc closes the panel (${p.url()})`);
  await panel(h).waitFor({ state: "detached" });
  // Esc with a menu open (the list's «⋯») closes the menu only, the panel stays
  await cards.first().click();
  h.expect(await openIs(h, id0), "the panel again");
  await p.getByTestId("clients-more").locator("visible=true").first().getByRole("button").first().click();
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor();
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  h.expect(await openIs(h, id0), `Esc closed the menu, the panel stays (${p.url()})`);
  // ↓ with the focus in the side menu is the menu's, not the list's
  await p.getByTestId("side-clients").focus();
  await p.keyboard.press("ArrowDown");
  await p.waitForTimeout(300);
  h.expect(await openIs(h, id0), `↓ outside the rows does not move the panel (${p.url()})`);
  // the open client falls out of the filter (or an action in the panel moves it out): the panel stays — it is the
  // card the person works with (review #426)
  const owing = (c) => db.invoices.some((i) => i.customerId === c.id && !i.void && i.totalCents > i.paidCents);
  const quiet = db.customers.find((c) => ids.includes(c.id) && !owing(c));
  h.expect(quiet, "a client who owes nothing is in the list");
  await rowOf(quiet.id).click();
  h.expect(await openIs(h, quiet.id), `the quiet client is open (${p.url()})`);
  await listChip(p, "clients", /^Должны \d+$/).click();
  await rowOf(quiet.id).waitFor({ state: "hidden" });
  h.expect(await openIs(h, quiet.id), `out of the filter → the panel stays (${p.url()})`);
  await panel(h).getByText(quiet.name, { exact: true }).first().waitFor();
  await listChip(p, "clients", /^Все \d+$/).click();
  await rowOf(quiet.id).waitFor();
  await escOnPage(p);
  // «✕» closes too
  await cards.nth(1).click();
  await panel(h).waitFor();
  await p.getByTestId("list-panel-close").locator("visible=true").getByRole("button").click();
  h.expect(await openIs(h, ""), `«✕» closes the panel (${p.url()})`);

  // the link, after a full reload
  await h.go(`/clients?open=${id1}`);
  await panel(h).getByText(name1, { exact: true }).first().waitFor();
  // the office sees the money in the panel (the sum of the job in work)
  const owes = db.customers.find((c) => db.invoices.some((i) => i.customerId === c.id && i.totalCents > i.paidCents) && db.jobs.some((j) => j.customerId === c.id && j.status !== "done"));
  await h.go(`/clients?open=${owes.id}`);
  await panel(h).getByTestId("client-in-work").first().waitFor();
  h.expect(/\$\d/.test(await panel(h).innerText()), "the office: the sums in the panel");
  // «Открыть» → the card's own screen
  await p.getByTestId("list-panel-open").locator("visible=true").click();
  await p.waitForURL(new RegExp(`/client/${owes.id}$`));

  // the technician: the panel shows what his card screen shows — no money
  await role(h, "tech");
  await h.go("/clients");
  const techCards = p.locator(ROWS);
  await techCards.first().waitFor();
  await techCards.first().click();
  await panel(h).waitFor();
  const txt = await panel(h).innerText();
  h.expect(!/Оплачено|Выставлено|Не оплачено|\$\d/.test(txt), `technician: no money in the panel (${txt.slice(0, 160)})`);
  await h.shot("panel-tech");
};
