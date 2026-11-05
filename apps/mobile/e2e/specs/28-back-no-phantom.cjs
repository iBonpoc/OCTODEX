/**
 * «Back» from a card leaves no trace of it (founder 05.11.2026): Clients → a client → back.
 * The list stays mounted under the card; it used to read the app's address, which still pointed at the card,
 * so it drew the card's header («‹ Clients», «Clients · Client») and kept it for a second after coming back.
 */
exports.run = async (h) => {
  const p = h.page;
  const trails = () => p.getByRole("toolbar", { name: "Где вы" });

  await h.go("/clients");
  const db = await h.db();
  const cust = db.customers[0];
  h.expect(await trails().count() === 0, "no trail on the Clients list");
  await p.getByText(cust.name, { exact: true }).first().click();
  await p.waitForURL(/\/client\//);
  await h.expectText(/Клиент/, "client card open");
  h.expect(await trails().count() === 1, `one trail while the card is open, the list under it has none (${await trails().count()})`);

  await trails().getByRole("button", { name: "Назад: Клиенты" }).click();
  await p.waitForURL(/\/clients$/);
  // right away, not after the slide ends
  h.expect(await trails().count() === 0, `no card header left on the list after back (${await trails().count()})`);
  h.expect(await p.getByRole("button", { name: "Назад: Клиенты" }).count() === 0, "no «‹ Clients» left on the list");
  await h.shot("clients-after-back");
};
