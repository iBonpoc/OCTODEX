/**
 * e2e 147 — «Замер желобов» (было «Замерить здесь») → «Сделать заявкой» (docs/specs/33-gutters-screens.md П21 M5b; стык S1b). Every view.
 * - the home «＋» has «Замер желобов» (было «Замерить здесь») only while the module is active;
 * - it opens a new draft without a lead; before the first save there is no «Сделать заявкой»; after it — there is;
 * - «Сделать заявкой» → «Привязать замер» → a new lead by its phone right in the sheet (founder 09.11, #688); saved → the new lead's card has «Открыть замер», and the draft
 *   is now the lead's; the canvas shows the lead.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const plus = () => p.locator(wide ? '[data-testid="fab-header"]:visible' : '[data-testid="fab"]:visible');
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const data = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters ?? { measurements: [] }, DB_KEY);
  const here = () => tid("fab-module.gutters.here");

  // off: not in «＋»
  await h.go("/today");
  await plus().first().click();
  await tid("fab-lead").or(tid("fab-module.gutters.here")).first().waitFor({ timeout: 5000 }).catch(() => {});
  h.expect((await here().count()) === 0, "off: no «Замер желобов» (было «Замерить здесь»)");
  await p.keyboard.press("Escape");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });

  await h.go("/today");
  await plus().first().click();
  await here().waitFor({ timeout: 5000 });
  await h.shot("plus");
  await here().click();
  await p.waitForURL(/\/module\/gutters\/draw$/, { timeout: 5000 });
  await tid("draw-surface").waitFor({ timeout: 8000 });
  h.expect((await tid("draw-to-lead").count()) === 0, "nothing saved yet: no «Сделать заявкой»");

  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  await p.mouse.move(b.x + b.width * 0.25, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.25 + (0.45 * i) / 12), y);
  await p.mouse.up();
  await skipLength(p);
  await tid("draw-to-lead").waitFor({ timeout: 6000 });
  const mid = new URL(p.url()).searchParams.get("m");
  h.expect(!!mid, "saved as a measurement");
  // the phone's copy is written with a pause after the save: wait on it (rule 19), do not read it once
  await waitFor(async () => (await data()).measurements.some((m) => m.id === mid && !m.leadId && !m.propertyId), "a draft without a lead or a property");
  await h.shot("draft");

  // «Сделать заявкой» → the core's new-lead form
  await tid("draw-to-lead").getByRole("button").click();
  // «Привязать замер» (founder 09.11): a new lead, an open lead or a client — here «Новая заявка»
  await tid("link-sheet").waitFor({ timeout: 5000 });
  // a new lead by its phone right here (#688; before: the core's form)
  const name = `Measure ${h.layout.width}`;
  await tid("link-new-phone").locator("input").pressSequentially(`626555${String(2000 + h.layout.width).slice(-4)}`);
  await tid("link-new-name").locator("input").fill(name);
  await tid("link-new-save").getByRole("button").click();
  await waitFor(async () => (await tid("link-sheet").count()) === 0, "the sheet closes");
  let leadId;
  await waitFor(async () => { leadId = await p.evaluate(([k, n]) => (((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.leads || []).find((l) => l.name === n) || {}).id, ["octo.db.v5", name]); return !!leadId; }, "the new lead is in the store");
  await waitFor(async () => (await tid("draw-lead").count()) === 1 && (await tid("draw-lead").innerText()).includes(name), "the canvas shows the new lead");
  await waitFor(async () => (await data()).measurements.some((m) => m.id === mid && m.leadId === leadId), "the draft is the new lead's");
  await h.go(`/lead/${leadId}`);
  await tid("module-gutters-measure").waitFor({ timeout: 8000 });
  h.expect(/Открыть замер/.test(await tid("module-gutters-measure").innerText()), "the lead card: «Открыть замер»");
  await h.shot("lead");
  await tid("module-gutters-measure").getByRole("button").click();
  await waitFor(() => new URL(p.url()).searchParams.get("m") === mid, "it opens the draft");
  await tid("draw-lead").waitFor({ timeout: 8000 });
  h.expect((await tid("draw-lead").innerText()).includes(name), "the canvas shows the lead");
};
