/**
 * e2e 473 — #2014 (audit #2004 B-10): a client with an empty name brought the whole clients list down (`name[0]!`).
 * С1 ДАНО среди клиентов есть клиент с пустым именем; КОГДА открываю «Клиенты»; ТОГДА список открывается, этот клиент — в группе «#».
 * Every view; seeded from a page without the app (h.seed, CHECKS §9 №12).
 */
const DB_KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/clients");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.customers?.length, DB_KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  const base = raw.db.customers[0];
  raw.db.customers = [...raw.db.customers.filter((c) => !c.id.startsWith("e2e-473")), { ...base, id: "e2e-473-empty", name: "", people: [], tags: [] }, { ...base, id: "e2e-473-digit", name: "1st Choice 473", people: [], tags: [] }];
  await h.seed(DB_KEY, raw);
  await h.go("/clients");
  await p.getByText("1st Choice 473").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(true, "С1 the clients list opens with a client of an empty name in it");
  // the letter groups are drawn on the phone and the desktop list (the tablet shows a grid of cards without them)
  if (h.layout.width !== 820) {
    h.expect((await p.getByText("#", { exact: true }).locator("visible=true").count()) >= 1, "С1 the «#» group is there");
    h.expect((await p.getByText(/^[A-Z]$/).locator("visible=true").count()) >= 1, "the letter groups are still there");
  }
  await h.shot("empty-name");
};
