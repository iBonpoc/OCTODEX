/**
 * e2e 463 — spec 56 §3а.4 (#1869): the catalog item's type and unit, every view, by testID and the store.
 * - A new item: no chips (no radio, tab or checkbox); «Тип ⌄» and «Единица ⌄» are SelectField rows; «Название (видит клиент)» is
 *   a label over its field; «Своя…» puts a field under the row; saved — the kind and the own unit are stored.
 * - The next new item starts with the type chosen last on this device.
 * - Sales without our costs, a material whose price the server counts from its cost (#1807, #1971): «Тип» is read-only and the
 *   words tell why with no number; the office gets no such words.
 * Seeded from a page without the app (h.seed, CHECKS §9 №12).
 */
const DB_KEY = "octo.db.v5";
const ID = "cat-e2e-463";
const NAME = "Counted Coil 463";
const OWN_ID = "cat-e2e-463-own";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const stored = (name) => p.waitForFunction(([k, n]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.catalog || []).some((x) => x.name === n), [DB_KEY, name], { timeout: 8000 });

  // — a new item
  await h.go("/catalog/new");
  await tid("catalog-name").waitFor({ timeout: 8000 });
  const old = await p.locator('[role="radio"], [role="tab"], [role="tablist"], [role="checkbox"]').locator("visible=true").count();
  h.expect(old === 0, `no chips, segments or checkboxes on the item (${old})`);
  h.expect(/Тип/.test(await tid("catalog-kind-button").innerText()), "«Тип ⌄» is a row");
  h.expect((await tid("catalog-name").getByText("Название (видит клиент)").count()) >= 1, "the name has its label over the field");
  await tid("catalog-kind-button").click();
  await tid("catalog-kind-material").click();
  h.expect(/Материал/.test(await tid("catalog-kind-button").innerText()), "«Тип · Материал»");
  await tid("catalog-name").locator("input").first().fill("Hanger 463");
  // the unit: a list, and «Своя…» puts a field under the row
  await tid("catalog-unit-button").click();
  await tid("catalog-unit-__own__").click();
  await tid("catalog-unit-own").waitFor({ timeout: 4000 });
  await tid("catalog-unit-own").locator("input").first().fill("box");
  await tid("catalog-cost").locator("input").first().fill("4");
  await h.shot("new");
  await tid("catalog-save").locator('[role="button"]').first().click();
  await stored("Hanger 463");
  const made = (await h.db()).catalog.find((x) => x.name === "Hanger 463");
  h.expect(made.kind === "material" && made.unit === "box", `saved: the kind and the own unit (${made.kind}, ${made.unit})`);

  // — the next new item starts with the type chosen last
  await h.go("/catalog/new");
  await tid("catalog-name").waitFor({ timeout: 8000 });
  await p.waitForFunction(() => /Материал/.test([...document.querySelectorAll('[data-testid="catalog-kind-button"]')].find((e) => e.offsetParent !== null)?.textContent || ""), null, { timeout: 4000 });
  h.expect(true, "a new item starts as «Материал» — the type chosen last");
  // a unit of the list
  await tid("catalog-unit-button").click();
  await tid("catalog-unit-ft").click();
  h.expect(/ft/.test(await tid("catalog-unit-button").innerText()) && (await tid("catalog-unit-own").count()) === 0, "«Единица · ft», no own field");

  // — sales without our costs: the type of a counted material is read-only
  const seed = async (costsVisible) => {
    await h.go("/catalog");
    await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db, DB_KEY, { timeout: 8000 });
    const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
    raw.db.catalog = [...raw.db.catalog.filter((x) => x.id !== ID && x.id !== OWN_ID), { id: ID, kind: "material", name: NAME, unit: "ft", priceCents: 6000, priceFromCost: true },
      // an item saved before the list: its unit is not one of it (#1869 review: shown as «Своя…» with its text, not lost)
      { id: OWN_ID, kind: "service", name: "Old Unit 463", unit: "bundle of 10", priceCents: 2500 }];
    raw.db.costsVisible = costsVisible;
    await h.seed(DB_KEY, raw);
  };
  await seed(false);
  await h.go(`/catalog/${ID}`);
  await tid("catalog-kind-locked").waitFor({ timeout: 8000 });
  const why = await tid("catalog-kind-locked").innerText();
  h.expect(/закупк/i.test(why) && !/\d|\$/.test(why), `the words tell why, with no number: ${why}`);
  h.expect((await tid("catalog-kind-button").getAttribute("aria-disabled")) === "true", "«Тип» is read-only");
  await h.shot("sales-locked");
  // the office: the type is changed as before
  await seed(true);
  await h.go(`/catalog/${ID}`);
  await tid("catalog-name").waitFor({ timeout: 8000 });
  h.expect((await tid("catalog-kind-locked").count()) === 0 && (await tid("catalog-kind-button").getAttribute("aria-disabled")) !== "true", "the office changes the type, no lock words");

  // an old item with its own unit: «Своя…» and the field with its text; a save keeps the unit as it was
  await h.go(`/catalog/${OWN_ID}`);
  await tid("catalog-unit-own").waitFor({ timeout: 8000 });
  h.expect(/Своя/.test(await tid("catalog-unit-button").innerText()), "«Единица · Своя…» for a unit not in the list");
  h.expect((await tid("catalog-unit-own").locator("input").first().inputValue()) === "bundle of 10", "the own unit's text is there");
  await tid("catalog-name").locator("input").first().fill("Old Unit 463 b");
  await tid("catalog-save").locator('[role="button"]').first().click();
  await stored("Old Unit 463 b");
  h.expect((await h.db()).catalog.find((x) => x.id === OWN_ID).unit === "bundle of 10", "a save keeps the old unit");
};
