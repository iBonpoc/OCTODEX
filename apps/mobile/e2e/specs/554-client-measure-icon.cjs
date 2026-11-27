/**
 * e2e 554 — «Замер» in the client's header icons opens the MEASUREMENT, not a new estimate (#2996, founder 27.11: «открыл
 * клиента, нажал замеры … открылась не карточка замер … а карточка создания нового эстимейта»). Every view.
 * - Gutters off: no «Замер» icon (the core does not pretend to measure); the main step still makes an estimate;
 * - Gutters on, a client with one address: the icon → that address's measurement on the module's canvas, never /estimate/new.
 * Finds things by testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);

  await h.go("/");
  const d0 = await db();
  const placesOf = (c) => d0.properties.filter((q) => q.customerId === c.id);
  const one = d0.customers.find((c) => placesOf(c).length === 1 && c.status !== "do_not_service");
  h.expect(!!one, "the demo has a servable client with one address");

  // Gutters off — no «Замер» icon at all
  await h.go(`/client/${one.id}`);
  await tid("client-call").first().waitFor({ timeout: 8000 });
  h.expect((await tid("client-measure").count()) === 0, "no measuring module — no «Замер» icon");

  // Gutters on — the icon is the address's measurement
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").waitFor({ timeout: 8000 });
  await h.go(`/client/${one.id}`);
  await tid("client-measure").first().waitFor({ timeout: 8000 });
  await h.shot("client-icons");
  await tid("client-measure").first().click();
  await p.waitForURL((u) => u.pathname.startsWith("/module/gutters/"), { timeout: 8000 });
  const u = new URL(p.url());
  h.expect(!u.pathname.startsWith("/estimate"), `«Замер» is not a new estimate (${u.pathname})`);
  h.expect(u.pathname === "/module/gutters/draw" && u.searchParams.get("property") === placesOf(one)[0].id, `the address's measurement (${u.pathname}${u.search})`);
};
