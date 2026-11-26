/**
 * e2e 215 — «Привязать» → «Привязать замер» (основатель 09.11, версия 475; docs/specs/33-gutters-canvas.md П20.23).
 * Every view.
 * - a draft without a client → «Привязать» → the sheet: «Новая заявка», a search, open leads and clients;
 * - a lead found by name → linked: the canvas shows the lead, the store has it, «Отменить» in the toast is there;
 * - a second draft → «Клиенты» (founder 09.11, #688: leads and clients apart) → a client with one address → linked to
 *   that address: the canvas shows the address; the store has the property, no lead;
 * - «⋯» (#692): «Привязать к другому» → a lead (the address is gone, the lead is there); «Отвязать» → a draft again;
 * - «⋯» → «Удалить замер» (#690) → back off the canvas, the measurement gone, «Отменить» brings it back; a measurement
 *   under a signed estimate can not be deleted (unit gutterLink.test.ts, db T161).
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
  await tid("module-gutters-status").filter({ hasText: /^Без срока/ }).waitFor({ timeout: 5000 });
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
  h.expect((await p.getByTestId("toast-undo").count()) >= 1, "«Отменить» in the toast");

  // to a client's only address
  const m2 = await draft();
  h.expect(m2 !== m1, "a second draft");
  await tid("draw-to-lead").getByRole("button").click();
  await tid("link-sheet").waitFor({ timeout: 5000 });
  // leads and clients apart (#688): the leads first; the client is under «Клиенты»
  h.expect((await tid("link-new-phone").count()) === 1, "a new lead by its phone right here");
  await tid("link-tabs").getByRole("tab").nth(1).click();
  await tid("link-new-phone").waitFor({ state: "hidden", timeout: 3000 });
  await tid("link-search").locator("input").fill(client.name);
  await tid(`link-client-${client.id}`).waitFor({ timeout: 3000 });
  await tid(`link-client-${client.id}`).getByRole("button").click();
  await waitFor(async () => (await tid("draw-place").count()) === 1 && (await tid("draw-place").innerText()).includes(place.address), "the canvas shows the client's address");
  await waitFor(async () => { const m = await mOf(m2); return m?.propertyId === place.id && !m.leadId; }, "the store: the client's property, no lead");
  h.expect((await tid("draw-to-lead").count()) === 0, "no «Привязать» any more");

  // «⋯» → «Привязать к другому» (#692): the lead instead of the address
  const who = async (name) => {
    await tid("draw-who").getByRole("button").click();
    const item = p.getByRole("menuitem", { name, exact: true });
    await item.waitFor({ timeout: 3000 });
    await item.click();
    await item.waitFor({ state: "hidden", timeout: 3000 });
  };
  await who("Привязать к другому");
  await tid("link-sheet").waitFor({ timeout: 5000 });
  await tid(`link-lead-${lead.id}`).getByRole("button").click();
  await waitFor(async () => { const m = await mOf(m2); return m?.leadId === lead.id && !m.propertyId; }, "relinked: the lead, no address");
  await waitFor(async () => (await tid("draw-lead").count()) === 1, "the canvas shows the lead");
  // «Отвязать» → a draft again
  await who("Отвязать (в черновики)");
  await waitFor(async () => { const m = await mOf(m2); return !!m && !m.leadId && !m.propertyId; }, "unlinked: a draft");
  await waitFor(async () => (await tid("draw-to-lead").count()) === 1, "«Привязать» again");
  // its toast stands above what lies at the bottom of the canvas — the toolbar and the chips (#1819: it lay on the toolbar)
  // (v2 #2211: a stack of up to three toasts, the newest on top — every one of them stands above; the lowest is checked)
  await tid("toast-text").first().waitFor({ timeout: 5000 });
  await p.waitForFunction(() => {
    const r = (id) => [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.getClientRects().length)?.getBoundingClientRect();
    const toast = [...document.querySelectorAll('[data-testid="toast-text"]')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect()).sort((a, b) => b.bottom - a.bottom)[0];
    const bar = r("draw-toolbar"), chip = r("draw-summary");
    if (!toast || !bar) return false;
    const pad = 4; // the toast's own pill is a little taller than its text
    return toast.bottom + pad <= bar.top && (!chip || toast.bottom + pad <= chip.top || toast.top >= chip.bottom || chip.right <= toast.left || chip.left >= toast.right);
  }, null, { timeout: 3000 }).catch(async () => h.expect(false, `the toast is above the toolbar and the chips (toast ${JSON.stringify(await tid("toast-text").last().boundingBox())}, toolbar ${JSON.stringify(await tid("draw-toolbar").boundingBox())})`));
  // from 820 the side panel of properties stands at the right: the toast (its «Отменить» at its right end) is left of it (#1895)
  if ((await tid("draw-panel").count()) > 0) {
    const panel = await tid("draw-panel").boundingBox();
    const undo = await tid("toast-undo").first().boundingBox();
    h.expect(!!undo && undo.x + undo.width <= panel.x - 4, `the toast is left of the panel of properties (undo ${JSON.stringify(undo)}, panel x ${panel.x})`);
  }
  await h.shot("toast-above-toolbar");
  // «Удалить замер» (#690): off the canvas, gone; «Отменить» brings it back
  await who("Удалить замер");
  await waitFor(async () => !(await mOf(m2)), "deleted: not in the store");
  h.expect(!/\/module\/gutters\/draw/.test(new URL(p.url()).pathname), "off the canvas");
  // …to the list of measurements (#1819: not an empty canvas «Замер»)
  await p.waitForURL(/\/module\/gutters\/list/, { timeout: 5000 }).catch(() => h.expect(false, `after «Удалить замер»: the list of measurements (${p.url()})`));
  // the deletion's own toast (not the «Отвязано» one still fading): its «Отменить»
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="toast-text"]')].some((e) => e.getClientRects().length && /Замер удалён/.test(e.textContent || "")), null, { timeout: 5000 });
  // ONE press, as a person does — once the toast is ready (#2086: a single press right at the toast's showing was lost on CI,
  // 820 light): «Отменить» is armed (aria-busy false: toastArmMs after it showed) and stands still where it is (the canvas
  // has left, two frames in a row the same place); then the store. Whether the toast can move under the finger on iPhone — #2134
  await p.waitForFunction(() => {
    const b = [...document.querySelectorAll('[data-testid="toast"]')].find((e) => e.getClientRects().length && /Замер удалён/.test(e.textContent || ""))?.querySelector('[data-testid="toast-undo"]');
    return !!b && b.getAttribute("aria-busy") === "false" && !document.querySelector('[data-testid="draw-surface"]');
  }, null, { timeout: 5000 }).catch(async () => h.expect(false, `«Отменить» armed and the canvas gone (${await p.evaluate(() => JSON.stringify({ undo: [...document.querySelectorAll('[data-testid="toast-undo"]')].map((e) => [e.getAttribute("aria-busy"), e.getClientRects().length]), canvas: document.querySelectorAll('[data-testid="draw-surface"]').length }))})`));
  await p.waitForFunction(() => new Promise((ok) => {
    const at = () => JSON.stringify([...document.querySelectorAll('[data-testid="toast"]')].find((e) => e.getClientRects().length && /Замер удалён/.test(e.textContent || ""))?.querySelector('[data-testid="toast-undo"]')?.getBoundingClientRect());
    const a = at();
    requestAnimationFrame(() => requestAnimationFrame(() => ok(a === at())));
  }), null, { timeout: 5000 });
  await p.getByTestId("toast").filter({ hasText: "Замер удалён" }).locator("visible=true").first().getByTestId("toast-undo").click();
  await waitFor(async () => !!(await mOf(m2)), "«Отменить»: back");
};
