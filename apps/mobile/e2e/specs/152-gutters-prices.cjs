/**
 * e2e 152 — цены модуля Gutters в прайсе компании (docs/specs/33-gutters-settings.md П22.10 M7d; S0b). Every view.
 * - director, the trial on: «Компания → Модули → Gutters → Цены и прайс» → the page; every labor line and part «not in the
 *   price list»; the settings page has its way here too;
 * - «Привязать»: an own labor item without properties gets the properties of «install, story 4» — found, its price;
 * - «Создать с тестовой ценой» on one row: one item, marked test;
 * - «Создать позиции сразу»: all the missing ones, each a TEST price (placeholder), «Отменить» takes them back; again → made;
 *   a second press is not offered, the catalog has no duplicates (one item per id and per properties);
 * - the $ under the drawing: with every item at a real price — no «тестовые цены», and the $ follows the install price;
 * - the office and sales change prices; a tech reads only; the trial over: read only.
 * Finds things by testID and the store; waits on what it checks.
 */
const KEY = "octo.db.v5";
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {}, KEY);
  const mod = async () => ((await db()).company?.modules?.gutters) || {};
  const catalog = async () => (await db()).catalog || [];
  const gutterItems = async () => (await catalog()).filter((x) => x.attributes && Object.keys(x.attributes).length);
  const editDb = (fn) => p.evaluate(([k, src]) => {
    const s = JSON.parse(localStorage.getItem(k));
    // eslint-disable-next-line no-new-func
    s.db = new Function("db", `return (${src})(db)`)(s.db);
    localStorage.setItem(k, JSON.stringify(s));
  }, [KEY, fn.toString()]);
  const money = async () => Number((await tid("draw-money").innerText()).replace(/[^\d.]/g, ""));
  // a card's testID says its state: gpr-miss-<part> (not in the list), gpr-test-<part> (a test price), gpr-found-<part>
  const card = (state, key) => tid(`gpr-${state}-${key}`);
  const missingCards = () => p.locator("[data-testid^=gpr-miss-]").locator("visible=true").count();

  await h.go("/today");
  await setRole(h, "director");
  // an own labor item without properties, to bind
  await editDb((d) => ({ ...d, catalog: [...d.catalog, { id: "own-install-4", kind: "labor", name: "Мой монтаж, 4 этаж", unit: "ft", priceCents: 700 }] }));
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => !!(await mod()).trialEndsAt, "trial on");
  await tid("module-gutters-prices").getByRole("button").click();
  await p.waitForURL(/\/module\/gutters\/prices$/, { timeout: 5000 });
  await tid("gpr-screen").waitFor({ timeout: 5000 });
  h.expect((await tid("gpr-ro").count()) === 0 && (await tid("gpr-locked").count()) === 0, "the director in the trial changes them");
  await card("miss", "labor.install.story1").waitFor({ timeout: 5000 });
  await tid("gpr-missing-n").waitFor({ timeout: 5000 });
  const n0 = await missingCards();
  h.expect(n0 >= 15, `labor and parts are all missing (${n0})`);
  await h.shot("missing");

  // bind: install, story 4 → the own item
  await card("miss", "labor.install.story4").click();
  await tid("gpr-bind").waitFor({ timeout: 5000 });
  await tid("gpr-bind-own-install-4").click();
  await waitFor(async () => {
    const it = (await catalog()).find((x) => x.id === "own-install-4");
    return it && it.attributes && it.attributes.work === "install" && it.attributes.story === "4";
  }, "the own item has the part's properties");
  await card("found", "labor.install.story4").waitFor({ timeout: 5000 });
  h.expect(/\$7(\.00)? \/ ft/.test(await card("found", "labor.install.story4").innerText()), "story 4: found, its own $7 / ft");

  // one row: a test item
  await card("miss", "labor.tile").click();
  await tid("gpr-bind-make").getByRole("button").click();
  await waitFor(async () => (await gutterItems()).filter((x) => x.attributes.work === "tile" && x.placeholder === true).length === 1, "tile: one test item");
  await card("test", "labor.tile").waitFor({ timeout: 5000 });

  // all at once: test prices, «Отменить», again
  const before = (await gutterItems()).length;
  // a double press: the second makes nothing and keeps the first one's «Отменить» (rule 5)
  await tid("gpr-make-all-btn").getByRole("button").dblclick();
  await waitFor(async () => (await gutterItems()).length > before + 10, "all the missing items made");
  const made = (await gutterItems()).filter((x) => x.id !== "own-install-4");
  h.expect(made.every((x) => x.placeholder === true && Number.isInteger(x.priceCents) && x.priceCents >= 0), "every made item is a test price in whole cents (rule 9)");
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  await waitFor(async () => (await gutterItems()).length === before, "«Отменить»: the made items are gone");
  await tid("gpr-make-all-btn").getByRole("button").click();
  await waitFor(async () => (await gutterItems()).length > before + 10, "made again");
  await waitFor(async () => (await tid("gpr-make-all-btn").count()) === 0 && (await tid("gpr-all-found").count()) === 1, "nothing left to make: no second press");
  h.expect((await missingCards()) === 0, "no row is missing");
  const all = await gutterItems();
  const sig = all.map((x) => `${x.unit}|${JSON.stringify(Object.entries(x.attributes).sort())}`);
  h.expect(new Set(all.map((x) => x.id)).size === all.length && new Set(sig).size === sig.length, "no duplicates: one item per id and per properties");
  await h.shot("made");

  // the settings page leads here too
  await h.go("/module/gutters/settings");
  await tid("gset-prices").waitFor({ timeout: 5000 });
  await tid("gset-prices").getByRole("button").click();
  await p.waitForURL(/\/module\/gutters\/prices$/, { timeout: 5000 });

  // the $ under the drawing: every item at a real price → no «тестовые цены»; the $ follows the install price
  await h.go("/today");
  await editDb((d) => ({ ...d, catalog: d.catalog.map((x) => (x.attributes && Object.keys(x.attributes).length ? { ...x, placeholder: false, priceCents: x.priceCents || 100, costCents: x.costCents === undefined ? undefined : x.costCents || 100 } : x)) }));
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.3;
  await p.mouse.move(b.x + b.width * 0.1, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.1 + (0.4 * i) / 12), y);
  await p.mouse.up();
  await waitFor(async () => (await p.getByTestId("draw-svg").first().locator("line:not([id^=halo])").count()) === 1, "one run");
  await waitFor(async () => (await money()) > 0, "a $ under the drawing");
  h.expect((await tid("draw-test-prices").count()) === 0, "every part from the price list at a real price: no «тестовые цены»");
  const m0 = await money();
  await p.waitForTimeout(1300); // the canvas writes the drawing as it leaves
  const drawUrl = new URL(p.url()).pathname + new URL(p.url()).search; // the same measurement again (?m=…)
  await h.go("/today");
  await editDb((d) => ({ ...d, catalog: d.catalog.map((x) => (x.attributes && x.attributes.work === "install" && x.attributes.story === "1" ? { ...x, priceCents: x.priceCents + 1000 } : x)) }));
  await h.go(drawUrl);
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await money()) > m0, `the $ follows the install price (${m0} → ${await money()})`);
  await h.shot("drawing");

  // the office and sales write the price list (app.is_staff, the core's /catalog); a tech has no way in and reads only
  for (const role of ["dispatcher", "sales"]) {
    await h.go("/today");
    await setRole(h, role);
    await h.go("/module/gutters/prices");
    await tid("gpr-screen").waitFor({ timeout: 5000 });
    h.expect((await tid("gpr-ro").count()) === 0, `${role} changes prices`);
  }
  await h.go("/today");
  await setRole(h, "tech");
  await h.go("/module/gutters/prices");
  await tid("gpr-screen").waitFor({ timeout: 5000 });
  await tid("gpr-ro").waitFor({ timeout: 5000 });
  h.expect((await tid("gpr-make-all-btn").count()) === 0, "a tech makes nothing");
  // the trial over: read only
  await h.go("/today");
  await setRole(h, "director");
  await editDb((d) => ({ ...d, company: { ...d.company, modules: { ...d.company.modules, gutters: { ...d.company.modules.gutters, trialEndsAt: "2020-01-01T00:00:00.000Z" } } } }));
  await h.go("/module/gutters/prices");
  await tid("gpr-locked").waitFor({ timeout: 5000 });
  h.expect((await tid("gpr-make-all-btn").count()) === 0, "the trial over: nothing to press");
  await h.shot("locked");
};
