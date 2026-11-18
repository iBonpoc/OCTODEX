/**
 * e2e 488 — a colour without an item of its own takes its group's price (#2000; spec 33-gutters-price-key §10.5 С1, С9, С10). Every view.
 * - С1: the price list has the gutter in white and brown at $10 (one group); a lead's measurement in black. «Сделать смету» — the black
 *   gutter's line is $10, bound to no item, `source.groupPrice` set, no «нет цены».
 * - С9: the price screen's «Создать позиции сразу» makes the black item too — in the group, at $10.
 * - С10: «Обновить смету» binds the line to the black item, still $10.
 * Seeded on the app's own data (editDb, as e2e 470); by testID and the store; waits on what it checks.
 */
const KEY = "octo.db.v5";
const ATTR = { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027", finish: "painted" };
const GROUP_OF = (db) => (db.catalog || []).find((x) => x.id === "e2e-488-w")?.attributes?.priceGroup;

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, KEY);
  const editDb = async (fn) => {
    await h.go("/today");
    const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    raw.db = fn(raw.db);
    await h.seed(KEY, raw);
  };
  /** the black gutter's line of this measurement in its estimate (the store), or null */
  const blackLine = () =>
    p.evaluate((k) => {
      const d = (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {};
      for (const e of d.estimates || []) for (const o of e.doc?.options || []) for (const l of o.lines) {
        const s = l.source;
        if (s && s.module === "gutters" && s.measurementId === "e2e-488-m" && /color=black/.test(s.key) && /part=gutter/.test(s.key) && s.section === "gutter") return l;
      }
      return null;
    }, KEY);

  // the module on
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });

  // white and brown in one group at $10; a lead's measurement with one black run (20 ft)
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  await editDb((d) => {
    const mk = (id, color) => ({ id, kind: "material", name: `Gutter ${color} (test)`, unit: "ft", priceCents: 1000, attributes: { ...ATTR, color }, updatedAt: "2026-11-12T10:00:00.000Z" });
    const g = d.moduleData?.gutters || { measurements: [], elements: [] };
    const run = { id: "e2e-488-r", measurementId: "e2e-488-m", kind: "run", geom: { a: [0, 0], b: [240, 0], lengthIn: 240 }, attrs: { ...ATTR, color: "black", story: 1, mount: "fascia", hanger: "hidden" }, confidence: "drawn" };
    return {
      ...d,
      catalog: [...d.catalog.filter((x) => !x.id.startsWith("e2e-488")), mk("e2e-488-w", "white"), mk("e2e-488-b", "brown")],
      moduleData: { ...d.moduleData, gutters: { measurements: [...g.measurements.filter((m) => m.id !== "e2e-488-m"), { id: "e2e-488-m", label: null, status: "draft", propertyId: lead.propertyId ?? null, leadId: lead.id }], elements: [...g.elements.filter((e) => e.measurementId !== "e2e-488-m"), run] } },
    };
  });
  await h.go("/module/gutters/prices");
  await tid("gpr-screen").waitFor({ timeout: 8000 });

  // С1: «Сделать смету» from the review — the black line at the group's price, unbound
  await h.go("/module/gutters/view?m=e2e-488-m&estimate=1");
  await tid("view-estimate-ask").waitFor({ timeout: 8000 });
  await tid("view-estimate-ask-action").getByRole("button").click();
  await p.waitForFunction((k) => {
    const d = (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {};
    return (d.estimates || []).some((e) => (e.doc?.options || []).some((o) => o.lines.some((l) => l.source?.measurementId === "e2e-488-m")));
  }, KEY, { timeout: 8000 });
  const l1 = await blackLine();
  h.expect(!!l1, "the black gutter has its line");
  h.expect(l1.unitPriceCents === 1000, `С1: the group's price $10 (${l1.unitPriceCents})`);
  h.expect(!l1.catalogItemId, "С1: bound to no item (there is none of this colour)");
  h.expect(/^e2e-488-[wb]$/.test(l1.source.groupPrice || ""), `С1: source.groupPrice names the source (${l1.source.groupPrice})`);
  h.expect(!l1.source.noPrice, "С1: no «нет цены»");
  await h.shot("estimate");

  // С9: the price screen makes the black item in the group, at $10
  await h.go("/module/gutters/prices");
  await tid("gpr-missing-n").waitFor({ timeout: 8000 });
  // the black gutter is a «нет позиции» row of the list too: the banner's N is what is seen (review #2000 №3)
  const row = p.locator('[data-testid^="gpr-miss-gutter"][data-testid$="-black"]').locator("visible=true").first();
  await row.waitFor({ timeout: 8000 });
  await row.scrollIntoViewIfNeeded();
  await h.shot("colour-row");
  await tid("gpr-missing-n-action").getByRole("button").click();
  await p.waitForFunction((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.catalog || []).some((x) => x.attributes?.color === "black" && x.attributes?.part === "gutter" && x.attributes?.size === "5"), KEY, { timeout: 8000 });
  const d1 = await db();
  const black = d1.catalog.find((x) => x.attributes?.color === "black" && x.attributes?.part === "gutter" && x.attributes?.size === "5");
  h.expect(black.priceCents === 1000 && !black.placeholder, `С9: the black item takes the group's price $10 (${black.priceCents}, sample ${!!black.placeholder})`);
  h.expect(/^gutters:v1:[0-9a-f]{16}$/.test(black.attributes.priceGroup || ""), "С9: the black item is in its price group");
  h.expect(!GROUP_OF(d1) || GROUP_OF(d1) === black.attributes.priceGroup, "С9: the same group as the white one once it has one");
  await h.shot("made");

  // С10: «Обновить смету» binds the line to the black item, the price the same. «Обновить» is offered for a measurement changed since
  // its estimate (status back to «draft» — what any edit of the drawing does; a price change alone never re-writes an estimate)
  await editDb((d) => ({ ...d, moduleData: { ...d.moduleData, gutters: { ...d.moduleData.gutters, measurements: d.moduleData.gutters.measurements.map((m) => (m.id === "e2e-488-m" ? { ...m, status: "draft" } : m)) } } }));
  await h.go("/module/gutters/view?m=e2e-488-m&estimate=1");
  await tid("view-estimate-ask").waitFor({ timeout: 8000 });
  await tid("view-estimate-ask-action").getByRole("button").click();
  await p.waitForFunction(([k, id]) => {
    const d = (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {};
    return (d.estimates || []).some((e) => (e.doc?.options || []).some((o) => o.lines.some((l) => l.source?.measurementId === "e2e-488-m" && l.catalogItemId === id)));
  }, [KEY, black.id], { timeout: 8000 });
  const l2 = await blackLine();
  h.expect(l2.unitPriceCents === 1000, `С10: still $10 (${l2.unitPriceCents})`);
  h.expect(!l2.source.groupPrice, "С10: no group price once the line has its own item");
};
