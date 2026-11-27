/**
 * e2e 258 — a round downspout without elbows of its own gets one 75° elbow, never «A» (#871, X-07; «Расход v2» §2.15 №2). Every view.
 * A measurement with a corrugated rectangular, a plain rectangular and a round downspout, put straight into the store: the
 * crew's PDF lists the elbows of the round one as 75° and «A» only for the corrugated rectangular one; a 2×3 one without a kind has none by
 * default (#1776, founder 16.11: «у прямого водостока стандартно колен 0, у ребристого 3 штуки A»).
 * Finds things by testID; waits on what it checks (no pauses).
 */
const { stands, docsFor } = require("../gutters.cjs");
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
  const ds = (id, runId, shape, size, more = {}, atIn = 60) => ({ id, measurementId: "e2e258", kind: "downspout", geom: { runId, atIn }, attrs: { shape, size, ...more }, confidence: "drawn" });
  st.db.moduleData = st.db.moduleData || {};
  st.db.moduleData.gutters = {
    measurements: [{ id: "e2e258", label: null, status: "ready", propertyId: place.id, leadId: null, accuracy: "tape", updatedAt: new Date().toISOString() }],
    elements: [run("e2e258-a", [0, 0], [240, 0]), run("e2e258-b", [240, 0], [240, 240]), ds("e2e258-d1", "e2e258-a", "rect", "3x4", { dsStyle: "corrugated" }), ds("e2e258-d2", "e2e258-b", "round", "3"), ds("e2e258-d3", "e2e258-a", "rect", "2x3", {}, 180)],
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
  await docsFor(p, "view-pdf-crew"); // #2989: in «⋯ → Документы бригады»
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
  // the elbow lines (#1766, #1800: a row is «<b>the supplier's name</b><br>properties | qty»): the corrugated rectangular one by
  // its style «A Elbow 75°», the round one by its angle «Round Elbow 75°» (one, «Расход v2») — never «A»; the plain 2×3 one has none (#1776)
  const rows = [...html.matchAll(/<td><b>([^<]*)<\/b>(?:<br>([^<]*))?<\/td><td class="r">([^<]*)<\/td>/g)]
    .filter((m) => /Elbow \d+°$/.test(m[1]))
    .map((m) => `${m[1]} · ${m[2] || ""} = ${m[3]}`);
  h.expect(rows.length === 2, "two elbow lines (the corrugated rectangular one and the round one; the plain one has none): " + rows.join(" | "));
  h.expect(!rows.some((r) => /^2×3 /.test(r)), "no elbow line of the plain 2×3 one (#1776): " + rows.join(" | "));
  h.expect(rows.some((r) => /^3×4 A Elbow 75° · [^=]*= 3 \S+$/.test(r)), "the rectangular: 3 × A 75° — " + rows.join(" | "));
  h.expect(rows.some((r) => /^\d″ Round Elbow 75° · [^=]*= 1 \S+$/.test(r)), "the round: 1 × 75°, no «A» — " + rows.join(" | "));
  await h.shot("round-elbows");
};
