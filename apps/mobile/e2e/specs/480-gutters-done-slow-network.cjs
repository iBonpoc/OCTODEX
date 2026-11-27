/**
 * e2e 480 — «Готово» на чертеже не ждёт сеть (#2019; spec 33-gutters-workflow «Готово без сети и при медленной сети», С1 — медленная сеть, С2 — без сети). Every view.
 * The drawing is written on the phone at once (the queue sends it later, rule 6): with the network gone, and with every request answered
 * only after 30 s (the browser holds them — page.route, no sleeping), «Готово» opens «Просмотр замера» at once and the measurement is
 * in the phone's data. Finds things by testID and the store; waits on what it checks.
 */
const { skipLength, savedOnce, editDrawing } = require("../gutters.cjs");
const { settle } = require("../settle.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const draw = async (at) => {
    await tid("draw-surface").waitFor({ timeout: 8000 });
    const b = await p.getByTestId("draw-surface").boundingBox();
    const y = b.y + b.height * at;
    await p.mouse.move(b.x + b.width * 0.25, y);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.25 + (0.45 * i) / 12), y);
    await p.mouse.up();
    await skipLength(p);
    await savedOnce(p);
  };
  /** «Готово» → «Просмотр замера» within `ms` (measured on the page's clock of the test runner) */
  const doneWithin = async (ms, what) => {
    const t0 = Date.now();
    await tid("draw-done").first().getByRole("button").click();
    await tid("view-screen").first().waitFor({ timeout: ms });
    h.expect(Date.now() - t0 <= ms, `${what}: «Готово» opened the review in ${Date.now() - t0} ms`);
  };

  await h.go("/today");
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, DB_KEY, { timeout: 8000 });

  // С1: every request answered only after 30 s (the browser holds it)
  const held = [];
  await p.route("**/*", (route) => {
    const u = route.request().url();
    if (/\/(_expo|assets|favicon)/.test(u) || route.request().resourceType() === "document") return route.continue();
    held.push(route);
    setTimeout(() => route.continue().catch(() => {}), 30_000);
  });
  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-measure").getByRole("button").click();
  await draw(0.4);
  const mid = new URL(p.url()).searchParams.get("m");
  await doneWithin(2000, "С1: a 30 s network");
  h.expect(((await db())?.moduleData?.gutters?.measurements ?? []).some((m) => m.id === mid), "the measurement is in the phone's data");
  await p.unroute("**/*");

  // С2: no network at all
  // (the app is loaded: the network goes now, the canvas is opened inside the app — «Править чертёж»)
  await p.context().setOffline(true);
  await editDrawing(p); // #2995: in «⋯» on the card's own screen
  await draw(0.6);
  await doneWithin(2000, "С2: no network");
  // the phone's copy is written a moment after a change (or when the page is left): wait for it, not for a time
  await settle(p, { quietMs: 300, maxMs: 3000 });
  await p.waitForFunction(([k, m]) => (((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements) || []).filter((e) => e.measurementId === m && e.kind === "run").length === 2, [DB_KEY, mid], { timeout: 8000 }).catch(() => h.expect(false, "both lines are in the phone's data"));
  await p.context().setOffline(false);
};
