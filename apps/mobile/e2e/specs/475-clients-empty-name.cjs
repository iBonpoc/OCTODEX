/**
 * e2e 473 — #2014 (audit #2004 B-10): a client with an empty name brought the whole clients list down (`name[0]!`).
 * С1 ДАНО среди клиентов есть клиент с пустым именем; КОГДА открываю «Клиенты»; ТОГДА список открывается, этот клиент — в группе «#».
 * Every view; seeded from a page without the app (h.seed, CHECKS §9 №12). v2 (#2350): the letters are drawn from 50 clients on
 * (features/clientGroups `LETTERS_FROM`; under it one card of rows), so the spec seeds 50 more clients; groups `clients-group-<key>`.
 */
const DB_KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/clients");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.customers?.length, DB_KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  const base = raw.db.customers[0];
  const many = Array.from({ length: 50 }, (_, i) => ({ ...base, id: `e2e-473-m${i}`, number: `CLT-9${String(i).padStart(3, "0")}`, name: `${"KLMNOPQRST"[i % 10]}ane Many ${i}`, people: [], tags: [] }));
  raw.db.customers = [...raw.db.customers.filter((c) => !c.id.startsWith("e2e-473")), ...many, { ...base, id: "e2e-473-empty", name: "", people: [], tags: [] }, { ...base, id: "e2e-473-digit", name: "1st Choice 473", people: [], tags: [] }];
  await h.seed(DB_KEY, raw);
  await h.go("/clients");
  await p.getByTestId("client-row-e2e-473-digit").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect(true, "С1 the clients list opens with a client of an empty name in it");
  // the empty name and the digit go to «#», the rest under their letters
  const hash = p.getByTestId("clients-group-#").locator("visible=true").first();
  await hash.waitFor({ timeout: 5000 });
  h.expect((await hash.getByTestId("client-row-e2e-473-empty").count()) === 1 && (await hash.getByTestId("client-row-e2e-473-digit").count()) === 1, "С1 the «#» group holds the empty name and the digit");
  h.expect((await p.locator('[data-testid^="clients-group-"]').locator("visible=true").count()) >= 5, "the letter groups are still there");
  await h.shot("empty-name");
};
