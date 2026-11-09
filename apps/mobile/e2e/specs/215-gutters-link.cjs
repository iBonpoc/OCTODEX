/**
 * e2e 215 — «Сделать заявкой» → «Привязать замер» (основатель 09.11, версия 475; docs/specs/33-gutters-canvas.md П20.23).
 * Every view.
 * - a draft without a client → «Сделать заявкой» → the sheet: «Новая заявка», a search, open leads and clients;
 * - a lead found by name → linked: the canvas shows the lead, the store has it, «Отменить» in the toast is there;
 * - a second draft → a client with one address → linked to that address: the canvas shows the address; the store has
 *   the property, no lead.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const draft = async () => {
    await h.go("/module/gutters/draw");
    await tid("draw-surface").waitFor({ timeout: 8000 });
    const b = await p.getByTestId("draw-surface").boundingBox();
    const y = b.y + b.height * 0.4;
    await p.mouse.move(b.x + b.width * 0.2, y);
    await p.mouse.down();
    for (let i = 1; i <= 8; i++) await p.mouse.move(b.x + b.width * (0.2 + (0.4 * i) / 8), y);
    await p.mouse.up();
    await skipLength(p);
    await tid("draw-to-lead").waitFor({ timeout: 6000 });
    return new URL(p.url()).searchParams.get("m");
  };
  const mOf = async (id) => ((await db()).moduleData?.gutters?.measurements || []).find((m) => m.id === id);

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  const d0 = await db();
  const lead = d0.leads.find((l) => !["won", "lost", "declined"].includes(l.status));
  const client = d0.customers.find((c) => d0.properties.filter((q) => q.customerId === c.id).length === 1);
  const place = d0.properties.find((q) => q.customerId === client.id);

  // to an open lead, found by name
  const m1 = await draft();
  await tid("draw-to-lead").getByRole("button").click();
  await tid("link-sheet").waitFor({ timeout: 5000 });
  h.expect((await tid("link-new").count()) === 1, "«Новая заявка» is offered");
  await h.shot("sheet");
  await tid("link-search").locator("input").fill(lead.name.split(" ")[0]);
  await tid(`link-lead-${lead.id}`).waitFor({ timeout: 3000 });
  await tid(`link-lead-${lead.id}`).getByRole("button").click();
  await waitFor(async () => (await tid("link-sheet").count()) === 0, "the sheet closes");
  await waitFor(async () => (await tid("draw-lead").count()) === 1 && (await tid("draw-lead").innerText()).includes(lead.name), "the canvas shows the lead");
  await waitFor(async () => (await mOf(m1))?.leadId === lead.id, "the store: the measurement is the lead's");
  h.expect((await p.getByRole("button", { name: "Отменить" }).count()) >= 1, "«Отменить» in the toast");

  // to a client's only address
  const m2 = await draft();
  h.expect(m2 !== m1, "a second draft");
  await tid("draw-to-lead").getByRole("button").click();
  await tid("link-sheet").waitFor({ timeout: 5000 });
  await tid("link-search").locator("input").fill(client.name);
  await tid(`link-client-${client.id}`).waitFor({ timeout: 3000 });
  await tid(`link-client-${client.id}`).getByRole("button").click();
  await waitFor(async () => (await tid("draw-place").count()) === 1 && (await tid("draw-place").innerText()).includes(place.address), "the canvas shows the client's address");
  await waitFor(async () => { const m = await mOf(m2); return m?.propertyId === place.id && !m.leadId; }, "the store: the client's property, no lead");
  h.expect((await tid("draw-to-lead").count()) === 0, "no «Сделать заявкой» any more");
};
