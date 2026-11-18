/**
 * e2e 495 — «Расход v2» PR-2 «Металлы и пайка» (spec 33-gutters-consumption §5а С11). Every view.
 * A lead's copper measurement (a gutter and a downspout on it): «Сделать смету» — the estimate has ONE «Soldering kit» line and the
 * soldering work by the points (named in the client's language); no sealant, no separate solder or flux. Seeded on the app's own data (as e2e 488);
 * by testID and the store; waits on what it checks.
 */
const KEY = "octo.db.v5";

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
  /** the lines of this measurement in its estimate (the store) */
  const lines = () =>
    p.evaluate((k) => {
      const d = (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {};
      for (const e of d.estimates || []) for (const o of e.doc?.options || []) {
        const ls = o.lines.filter((l) => l.source && l.source.module === "gutters" && l.source.measurementId === "e2e-495-m");
        if (ls.length) return ls;
      }
      return [];
    }, KEY);

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });

  // a copper half-round gutter (20 ft) on a lead, a copper round downspout on it
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  await editDb((d) => {
    const g = d.moduleData?.gutters || { measurements: [], elements: [] };
    const cu = { material: "copper", profile: "half_round", size: "6", story: 1, mount: "fascia", hanger: "hr_shank_fascia" };
    const run = { id: "e2e-495-r", measurementId: "e2e-495-m", kind: "run", geom: { a: [0, 0], b: [240, 0], lengthIn: 240 }, attrs: cu, confidence: "drawn" };
    const dsp = { id: "e2e-495-d", measurementId: "e2e-495-m", kind: "downspout", geom: { runId: "e2e-495-r", atIn: 200 }, attrs: { shape: "round", size: "3", material: "copper", bottom: { kind: "extension" } }, confidence: "drawn" };
    return {
      ...d,
      moduleData: { ...d.moduleData, gutters: { measurements: [...g.measurements.filter((m) => m.id !== "e2e-495-m"), { id: "e2e-495-m", label: null, status: "draft", propertyId: lead.propertyId ?? null, leadId: lead.id }], elements: [...g.elements.filter((e) => e.measurementId !== "e2e-495-m"), run, dsp] } },
    };
  });

  await h.go("/module/gutters/view?m=e2e-495-m&estimate=1");
  await tid("view-estimate-ask").waitFor({ timeout: 8000 });
  await tid("view-estimate-ask-action").getByRole("button").click();
  await p.waitForFunction((k) => {
    const d = (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {};
    return (d.estimates || []).some((e) => (e.doc?.options || []).some((o) => o.lines.some((l) => l.source?.measurementId === "e2e-495-m")));
  }, KEY, { timeout: 8000 });
  const ls = await lines();
  const kit = ls.filter((l) => /part=soldering_kit/.test(l.source.key));
  const work = ls.filter((l) => /work=solder(\||$)/.test(l.source.key));
  h.expect(kit.length === 1 && Number(kit[0].quantity) === 1, `С11: one «Soldering kit» line, 1 (${kit.map((l) => l.quantity).join()})`);
  h.expect(/Soldering kit/.test(kit[0].name), `С11: its name in words (${kit[0].name})`);
  h.expect(work.length === 1 && Number(work[0].quantity) > 0, `С11: the soldering work by the points (${work.map((l) => l.quantity).join()})`);
  h.expect(!ls.some((l) => /part=sealant/.test(l.source.key)), "С11: no sealant on copper");
  h.expect(!ls.some((l) => /part=(solder|flux)(\||$)/.test(l.source.key)), "С11: no separate solder or flux line");
  // the lines are in the client's language (rule 7; a US client — English): the work has a word, not its code
  h.expect(!/solder$|^labor/.test(work[0].name) && work[0].name.trim().length > 0, `С11: the work's name in words (${work[0].name})`);
  // the estimate on screen has the kit and the work: their lines by testID (each module line has its marks, «Из замера»)
  await p.getByTestId(`ue-line-marks-${kit[0].id}`).locator("visible=true").first().waitFor({ timeout: 8000 });
  await p.getByTestId(`ue-line-marks-${work[0].id}`).locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.shot("estimate");
};
