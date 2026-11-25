/**
 * e2e 502 — #1919 (founder 16.11: «настройки модуля спрятаны очень далеко… открываешь Gutters, там сверху»): the Gutters tab's header has
 * «⋯» last (DS §12.2) with «Настройки Gutters» and «Цены и прайс» — the same places and roles as «Компания → Модули»; the settings screen
 * puts what changes often first (prices as a row, what we install, colours) and what is set once last (the length format, the house);
 * a tech has no «⋯». Every view. By testID; waits on what it checks.
 */
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const openMore = async () => {
    await tid("measurements-more").waitFor({ timeout: 8000 });
    await tid("measurements-more").getByRole("button").click();
    await p.getByRole("menu").locator("visible=true").first().waitFor({ timeout: 5000 });
  };
  const pick = async (re) => p.getByRole("menu").locator("visible=true").first().getByRole("menuitem").filter({ hasText: re }).first().click();

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });

  // the tab: «＋» then «⋯» on the right, «⋯» last
  await h.go("/module/gutters/list");
  await tid("measurements-more").waitFor({ timeout: 8000 });
  const add = await tid("measurements-new").boundingBox();
  const more = await tid("measurements-more").boundingBox();
  h.expect(add && more && more.x > add.x, `«⋯» after «＋» (${add && Math.round(add.x)} → ${more && Math.round(more.x)})`);
  await h.shot("tab");

  // «⋯» → «Настройки Gutters»
  await openMore();
  await h.shot("menu");
  await pick(/Настройки/);
  await p.waitForURL((u) => u.pathname.endsWith("/module/gutters/settings"), { timeout: 8000 });
  await tid("gset-screen").waitFor({ timeout: 8000 });
  // what changes often first: prices, what we install, colours; set once — the length format and the house — last
  const y = async (id) => (await tid(id).boundingBox()).y;
  const order = [await y("gset-prices"), await y("gset-offer"), await y("gset-palette"), await y("gset-rules"), await y("gset-len"), await y("gset-house")];
  h.expect(order.every((v, i) => i === 0 || v > order[i - 1]), `the order: prices, offer, palette … rules … length, house (${order.map(Math.round).join(", ")})`);
  await h.shot("settings");

  // the prices row opens the price list
  await tid("gset-prices").getByRole("button").click();
  await p.waitForURL((u) => u.pathname.endsWith("/module/gutters/prices"), { timeout: 8000 });

  // «⋯» → «Цены и прайс»
  await h.go("/module/gutters/list");
  await openMore();
  await pick(/Цены/);
  await p.waitForURL((u) => u.pathname.endsWith("/module/gutters/prices"), { timeout: 8000 });

  // a tech: neither the settings nor the prices — no «⋯»
  await h.seed("octo.role.v1", "tech");
  await h.go("/module/gutters/list");
  await tid("measurements-new").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("measurements-more").count()) === 0, "a tech: no «⋯»");
  await h.seed("octo.role.v1", "director");
};
