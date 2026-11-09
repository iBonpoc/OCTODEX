/**
 * e2e 146 — «Замер» из заявки и объекта (docs/specs/33-gutters-screens.md П21 M5b; стык S4g). Every view.
 * - the module off: the lead card has no «Замер» (founder О2: a module not active adds nothing);
 * - the trial on: the lead → «Замер» → the canvas of a new measurement linked to the lead (and its property); draw →
 *   saved; back to the lead → «Открыть замер» opens the same measurement with its drawing;
 * - a property → «Замер»: its own new measurement linked to it.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const runs = () => svg().locator("line:not([id^=halo])").count();
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const drawRun = async () => {
    const b = await p.getByTestId("draw-surface").boundingBox();
    const y = b.y + b.height * 0.42;
    const a = [b.x + b.width * 0.25, y], z = [b.x + b.width * 0.7, y];
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((z[0] - a[0]) * i) / 12, y);
    await p.mouse.up();
    await skipLength(p);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const data = async () => (await db())?.moduleData?.gutters ?? { measurements: [], elements: [] };
  const idInUrl = () => new URL(p.url()).searchParams.get("m");
  const measureBtn = () => tid("module-gutters-measure");

  await h.go("/today");
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  h.expect(!!lead, "the demo has a lead");

  // off: no «Замер» on the lead
  await h.go(`/lead/${lead.id}`);
  await p.getByText(lead.name, { exact: true }).first().waitFor({ timeout: 8000 });
  h.expect((await measureBtn().count()) === 0, "off: no «Замер» on the lead");

  // on (the trial)
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });

  await h.go(`/lead/${lead.id}`);
  await measureBtn().waitFor({ timeout: 8000 });
  h.expect(/^Замер желобов$/.test((await measureBtn().innerText()).trim()), "«Замер желобов» (founder 09.11, #697)");
  await h.shot("lead");
  await measureBtn().getByRole("button").click();
  await p.waitForURL(/\/module\/gutters\/draw\?/, { timeout: 5000 });
  h.expect(new URL(p.url()).searchParams.get("lead") === lead.id, "the canvas knows the lead");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await drawRun();
  await tid("draw-saved").waitFor({ timeout: 5000 });
  await waitFor(() => !!idInUrl(), "saved: the address names it");
  const mid = idInUrl();
  await waitFor(async () => (await data()).measurements.some((m) => m.id === mid && m.leadId === lead.id && m.propertyId === (lead.propertyId ?? null)), "the measurement is the lead's (and its property's)");
  await tid("draw-lead").waitFor({ timeout: 3000 });
  h.expect((await tid("draw-to-lead").count()) === 0, "on a lead: no «Сделать заявкой»");
  await h.shot("canvas");

  // back on the lead: «Открыть замер» opens the same one
  await h.go(`/lead/${lead.id}`);
  await measureBtn().waitFor({ timeout: 8000 });
  h.expect(/Открыть замер/.test(await measureBtn().innerText()), "«Открыть замер»");
  await measureBtn().getByRole("button").click();
  await waitFor(() => idInUrl() === mid, "the same measurement");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await runs()) === 1, "with its drawing");

  // a property: its own
  const prop = (await db()).properties.find((x) => x.id !== lead.propertyId);
  await h.go(`/property/${prop.id}`);
  await measureBtn().waitFor({ timeout: 8000 });
  h.expect(/^Замер желобов$/.test((await measureBtn().innerText()).trim()), "another property: «Замер желобов» (no measurement yet)");
  await measureBtn().getByRole("button").click();
  await p.waitForURL(/\/module\/gutters\/draw\?property=/, { timeout: 5000 });
  await tid("draw-surface").waitFor({ timeout: 8000 });
  h.expect((await runs()) === 0, "a new, empty canvas");
  await drawRun();
  await waitFor(async () => (await data()).measurements.some((m) => m.propertyId === prop.id && !m.leadId), "the property's measurement");
};
