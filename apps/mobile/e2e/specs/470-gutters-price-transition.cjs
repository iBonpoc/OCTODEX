/**
 * e2e 470 — «Одна цена на все цвета» (#1913 PR3; spec 33-gutters-price-key §4.4 п.2, §7а п.3; приёмка §6а С3–С8 на экране). Every view.
 * - The price list has a part in white $8 and brown $9 (no group yet): the price screen says it once (one banner), the sheet shows
 *   «было» per colour and the suggested price WITH why; the person picks; «Сделать одну цена» — both items one price and one group;
 *   their supplier codes stay; «Отменить» puts it all back.
 * - Sales without our costs: told who does it, nothing to press.
 * By testID and the store; waits on what it checks. Seeded on the app's own data (editDb, as e2e 152).
 */
const KEY = "octo.db.v5";
const ATTR = { part: "gutter", profile: "k", size: "5", material: "aluminum", gauge: ".027" };

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  /** the app's data changed from a page without the app (h.seed, CHECKS §9 №12) */
  const editDb = async (fn) => {
    await h.go("/today");
    const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
    raw.db = fn(raw.db);
    await h.seed(KEY, raw);
  };
  const items = async () => ((await h.db()).catalog || []).filter((x) => x.id === "e2e-470-w" || x.id === "e2e-470-b");

  // the module on, two colours of one part at different prices (the white changed last)
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  const mk = (id, color, priceCents, sku, at) => ({ id, kind: "material", name: `Gutter ${color} (test)`, unit: "ft", priceCents, attributes: { ...ATTR, color }, supplierSku: sku, updatedAt: at });
  await editDb((db) => ({ ...db, catalog: [...db.catalog.filter((x) => !x.id.startsWith("e2e-470")), mk("e2e-470-w", "white", 800, "W-1", "2026-11-12T10:00:00.000Z"), mk("e2e-470-b", "brown", 900, "B-1", "2026-11-10T10:00:00.000Z")] }));
  await h.go("/module/gutters/prices");
  await tid("gpr-screen").waitFor({ timeout: 8000 });
  await tid("gpr-pg").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("gpr-missing-n").locator("visible=true").count()) === 0, "one banner on the screen (DS Б9): the one-price one first");
  await h.shot("banner");
  await tid("gpr-pg-action").getByRole("button").click();
  await tid("gpr-pg-sheet").waitFor({ timeout: 5000 });
  const sheet = await tid("gpr-pg-sheet").innerText();
  h.expect(/\$8(\.00)? \//.test(sheet) && /\$9(\.00)? \//.test(sheet), `«было»: both prices with their colours (${sheet.slice(0, 200)})`);
  h.expect(/меняли последней/.test(sheet), "the suggested price says why: changed last");
  await h.shot("sheet");

  // the person picks the brown price — then «Сделать одну цену»
  const pick = p.locator('[data-testid^="gpr-pg-pick-"][data-testid$="-button"]').locator("visible=true").first();
  await pick.click();
  await p.getByRole("menu").locator("visible=true").first().getByRole("menuitem").filter({ hasText: /\$9(\.00)? \// }).first().click();
  await tid("gpr-pg-sheet").getByText("Выбрано вами").waitFor({ timeout: 5000 });
  await h.shot("picked"); // the person's own choice: «Выбрано вами» instead of the suggestion's why (§7а п.3)
  await tid("gpr-pg-do").getByRole("button").click();
  await tid("gpr-pg-sheet").waitFor({ state: "detached", timeout: 5000 });
  await p.waitForFunction((k) => {
    const c = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.catalog || []).filter((x) => x.id.startsWith("e2e-470"));
    return c.length === 2 && c.every((x) => x.priceCents === 900 && /^gutters:v1:[0-9a-f]{16}$/.test(x.attributes?.priceGroup || "")) && c[0].attributes.priceGroup === c[1].attributes.priceGroup;
  }, KEY, { timeout: 8000 });
  const after = await items();
  h.expect(after.map((x) => x.supplierSku).sort().join() === "B-1,W-1", "each colour keeps its supplier code");
  h.expect((await p.getByTestId("gpr-pg").locator("visible=true").count()) === 0, "after the transition nothing more to bring together");
  await h.shot("done");

  // «Отменить»: all of it back
  await p.getByTestId("toast-undo").locator("visible=true").first().click();
  await p.waitForFunction((k) => {
    const c = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.catalog || []).filter((x) => x.id.startsWith("e2e-470"));
    const by = Object.fromEntries(c.map((x) => [x.id, x]));
    return by["e2e-470-w"]?.priceCents === 800 && by["e2e-470-b"]?.priceCents === 900 && c.every((x) => !x.attributes?.priceGroup);
  }, KEY, { timeout: 8000 });
  await tid("gpr-pg").waitFor({ timeout: 5000 });

  // sales without our costs: told who does it, nothing to press
  await h.seed("octo.role.v1", "sales");
  await editDb((db) => ({ ...db, costsVisible: false }));
  await h.go("/module/gutters/prices");
  await tid("gpr-pg-ask").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("gpr-pg-action").count()) === 0, "sales without costs: no «Посмотреть»");
  await h.seed("octo.role.v1", "director");
};
