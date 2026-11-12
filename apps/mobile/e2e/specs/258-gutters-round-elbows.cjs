/**
 * e2e 258 — a round downspout without elbows of its own gets 45° ones, not «A» (#871, X-07). Every view.
 * A measurement with a rectangular and a round downspout, put straight into the store: the crew's PDF lists the elbows
 * of the round one as 45° and «A» only for the rectangular one.
 * Finds things by testID; waits on what it checks (no pauses).
 */
const { stands } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  const st = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const place = st.db.properties[0];
  const run = (id, a, b) => ({ id, measurementId: "e2e258", kind: "run", geom: { a, b }, attrs: {}, confidence: "drawn" });
  const ds = (id, runId, shape, size) => ({ id, measurementId: "e2e258", kind: "downspout", geom: { runId, atIn: 60 }, attrs: { shape, size }, confidence: "drawn" });
  st.db.moduleData = st.db.moduleData || {};
  st.db.moduleData.gutters = {
    measurements: [{ id: "e2e258", label: null, status: "ready", propertyId: place.id, leadId: null, accuracy: "tape", updatedAt: new Date().toISOString() }],
    elements: [run("e2e258-a", [0, 0], [240, 0]), run("e2e258-b", [240, 0], [240, 240]), ds("e2e258-d1", "e2e258-a", "rect", "3x4"), ds("e2e258-d2", "e2e258-b", "round", "3")],
  };
  await h.seed(KEY, st);

  await h.go("/module/gutters/view?m=e2e258");
  await tid("view-screen").waitFor({ timeout: 8000 });
  await stands(tid("view-head"));
  await p.evaluate(() => {
    window.__pdf = null;
    for (const f of document.querySelectorAll("iframe")) f.dataset.seen = "1";
    const add = document.body.appendChild.bind(document.body);
    document.body.appendChild = (el) => {
      const r = add(el);
      if (el.tagName === "IFRAME") el.contentWindow.print = () => {};
      return r;
    };
  });
  await tid("view-pdf-crew").getByRole("button").click();
  await p.waitForFunction(
    () => {
      const f = [...document.querySelectorAll("iframe:not([data-seen])")].find((x) => x.contentDocument?.body?.innerHTML.includes("<svg"));
      if (f) window.__pdf = f.contentDocument.documentElement.outerHTML;
      return !!window.__pdf;
    },
    null,
    { timeout: 10000 },
  );
  const html = await p.evaluate(() => window.__pdf);
  // the elbow lines by their shape and style, not by the word «Колено» (that is the dictionary's): «… · A» / «… · 45»
  const rows = [...html.matchAll(/<td>([^<]*· (?:A|45))<\/td><td class="r">([^<]*)<\/td>/g)].map((m) => `${m[1]} = ${m[2]}`);
  h.expect(rows.length === 2, "two elbow lines (a rectangular one and a round one): " + rows.join(" | "));
  h.expect(rows.some((r) => /(rect|Прямоугольный)/.test(r) && /· A = 3 \S+$/.test(r)), "the rectangular: 3 × A — " + rows.join(" | "));
  h.expect(rows.some((r) => /(round|Круглый)/.test(r) && /· 45 = 3 \S+$/.test(r)), "the round: 3 × 45°, no «A» — " + rows.join(" | "));
  await h.shot("round-elbows");
};
