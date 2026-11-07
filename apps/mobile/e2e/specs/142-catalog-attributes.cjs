/**
 * e2e 142 — properties of a price-list item (docs/specs/33-gutters-module.md П16, C3; core K1). Every view.
 * - an item a trade module gave properties (put into the phone's copy, as the module will): its screen shows
 *   «Свойства: …» (values only); an item without them shows no such line;
 * - the director renames the item and saves: the properties stay (the core never drops what a module set).
 * Waits on the stored data by condition, finds things by testID.
 */
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitDb = async (ok, what) => {
    let db = await h.db();
    for (let i = 0; i < 30 && !(db && ok(db)); i++) { await p.waitForTimeout(200); db = await h.db(); }
    h.expect(!!db && ok(db), what);
    return db;
  };
  await h.go("/today");
  await setRole(h, "director");
  await waitDb((d) => d.catalog.some((x) => x.id === "cat-haul"), "the demo catalog is stored");
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.catalog = raw.db.catalog.map((x) => (x.id === "cat-haul" ? { ...x, attributes: { size: "6", color: "white", profile: "k" } } : x));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/catalog/cat-haul");
  await tid("catalog-attributes").waitFor({ timeout: 5000 });
  const line = (await tid("catalog-attributes").innerText()).trim();
  h.expect(line === "Свойства: white · k · 6", `the properties line (${line})`);
  await h.shot("attributes");

  // renamed and saved: the properties stay
  const name = `Haul ${h.layout.width}${h.layout.theme[0]}`;
  await tid("catalog-name").locator("input").last().fill(name);
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click();
  const db = await waitDb((d) => d.catalog.some((x) => x.id === "cat-haul" && x.name === name), "the new name is saved");
  const it = db.catalog.find((x) => x.id === "cat-haul");
  h.expect(it.attributes && it.attributes.color === "white" && it.attributes.size === "6", `the properties stay (${JSON.stringify(it.attributes)})`);

  // an item without properties: no line
  const other = db.catalog.find((x) => x.id !== "cat-haul" && !x.attributes && x.kind !== "kit");
  await h.go(`/catalog/${other.id}`);
  await tid("catalog-name").locator("input").last().waitFor({ timeout: 5000 });
  h.expect((await tid("catalog-attributes").count()) === 0, "no properties line without properties");
};
