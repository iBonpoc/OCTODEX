/**
 * The open card beside the list on 1280 (docs/specs/06-list-cards.md «Панель 1280», 10-nav-wide §1.5; nav/listPanel.ts).
 * 1280: a tap opens the client on the right, the list stays; `/clients?open=<id>`; ↓/↑ — the next / previous client,
 * Esc closes; «Открыть» — the card on its own screen; the link opens the panel after a reload too. The address is
 * replaced, not pushed: «back» leaves the list instead of stepping through the cards shown.
 * The panel draws the same body as the card's screen: the technician sees no money there (role check).
 * 390/820: no panel — a tap opens the card's screen, and a link with ?open= goes to that screen.
 */
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
  const cards = p.locator('[data-testid="list-card"]:visible');
  await cards.first().waitFor();
  const names = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  const idOf = (n) => db.customers.find((c) => n.startsWith(c.name))?.id;
  const [id0, id1] = [idOf(names[0]), idOf(names[1])];
  h.expect(id0 && id1, `two clients in the list (${names.slice(0, 2).join(" | ")})`);
  const name1 = db.customers.find((c) => c.id === id1).name;

  if (!desk) {
    await cards.first().click();
    await p.waitForURL(new RegExp(`/client/${id0}`));
    h.expect((await panel(h).count()) === 0, `${h.layout.width}: no panel, the card's own screen`);
    // a link with ?open= on a narrower window: the card's screen
    await h.go(`/clients?open=${id1}`);
    await p.waitForURL(new RegExp(`/client/${id1}`));
    await p.getByRole("heading", { level: 1, name: name1 }).locator("visible=true").first().waitFor();
    return;
  }

  const startLen = await p.evaluate(() => history.length);
  await cards.first().click();
  h.expect(await openIs(h, id0), `a tap opens the panel (${p.url()})`);
  await panel(h).waitFor();
  h.expect((await cards.first().getAttribute("aria-current")) === "true", "the open row is marked (aria-current)");
  h.expect(new URL(p.url()).pathname === "/clients", `the list stays (${p.url()})`);
  await h.shot("panel");

  await p.keyboard.press("ArrowDown");
  h.expect(await openIs(h, id1), `↓ → the next client (${p.url()})`);
  await panel(h).getByText(name1, { exact: true }).first().waitFor();
  await p.keyboard.press("ArrowUp");
  h.expect(await openIs(h, id0), `↑ → back to the first (${p.url()})`);
  h.expect((await p.evaluate(() => history.length)) === startLen, "open, ↓, ↑ replace the address, history does not grow");
  await p.keyboard.press("Escape");
  h.expect(await openIs(h, ""), `Esc closes the panel (${p.url()})`);
  await panel(h).waitFor({ state: "detached" });
  // Esc with the status menu open inside the panel closes the menu only, the panel stays
  await cards.first().click();
  h.expect(await openIs(h, id0), "the panel again");
  await panel(h).getByRole("button", { name: /^Статус клиента/ }).first().click();
  await p.locator('[aria-modal="true"]').first().waitFor();
  await p.keyboard.press("Escape");
  await p.locator('[aria-modal="true"]').first().waitFor({ state: "detached" });
  h.expect(await openIs(h, id0), `Esc closed the menu, the panel stays (${p.url()})`);
  // ↓ with the focus in the side menu is the menu's, not the list's
  await p.getByTestId("side-clients").focus();
  await p.keyboard.press("ArrowDown");
  await p.waitForTimeout(300);
  h.expect(await openIs(h, id0), `↓ outside the rows does not move the panel (${p.url()})`);
  // the open client falls out of the filter: the panel closes and the address drops ?open=, «Все» does not bring it back
  const owing = (c) => db.invoices.some((i) => i.customerId === c.id && !i.void && i.totalCents > i.paidCents);
  const quiet = db.customers.find((c) => names.some((n) => n.startsWith(c.name)) && !owing(c));
  h.expect(quiet, "a client who owes nothing is in the list");
  {
    await cards.filter({ has: p.getByText(quiet.name, { exact: true }) }).first().click();
    h.expect(await openIs(h, quiet.id), `the quiet client is open (${p.url()})`);
    await p.getByText(/^Должны · \d+$/).last().click();
    h.expect(await openIs(h, ""), `out of the filter → the panel closes (${p.url()})`);
    await p.getByText(/^Все · \d+$/).last().click();
    await p.waitForTimeout(300);
    h.expect((await panel(h).count()) === 0, "back to «Все»: the panel stays closed");
  }
  await p.keyboard.press("Escape");
  // «✕» closes too
  await cards.nth(1).click();
  await panel(h).waitFor();
  await p.getByTestId("list-panel-close").locator("visible=true").getByRole("button").click();
  h.expect(await openIs(h, ""), `«✕» closes the panel (${p.url()})`);

  // the link, after a full reload
  await h.go(`/clients?open=${id1}`);
  await panel(h).getByText(name1, { exact: true }).first().waitFor();
  // the office sees the money in the panel, as on the card's screen
  const owes = db.customers.find((c) => db.invoices.some((i) => i.customerId === c.id && i.totalCents > i.paidCents));
  await h.go(`/clients?open=${owes.id}`);
  await panel(h).getByText("Оплатил всего", { exact: true }).first().waitFor();
  // «Открыть» → the card's own screen
  await p.getByTestId("list-panel-open").locator("visible=true").click();
  await p.waitForURL(new RegExp(`/client/${owes.id}$`));

  // the technician: the panel shows what his card screen shows — no money
  await role(h, "tech");
  await h.go("/clients");
  const techCards = p.locator('[data-testid="list-card"]:visible');
  await techCards.first().waitFor();
  await techCards.first().click();
  await panel(h).waitFor();
  const txt = await panel(h).innerText();
  h.expect(!/Оплатил всего|Выставлено всего|Не оплачено|\$\d/.test(txt), `technician: no money in the panel (${txt.slice(0, 160)})`);
  await h.shot("panel-tech");
};
