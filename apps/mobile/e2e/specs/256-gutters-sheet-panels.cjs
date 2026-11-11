/**
 * e2e 256 — a small contour next to a big one gets its own panel (#1091, founder 12.11: «всё сбито в кучу»). Every view.
 * A measurement of a 250′ 4″ gutter and a 34′ 5″ · 25′ 4″ · 13′ 5″ contour, put straight into the store:
 * - «Просмотр замера»: the sheet has two panels («Контур 1», «Контур 2»), each with its own scale, the numbers 1–4 once;
 * - «PDF бригаде»: the same sheet in the document;
 * - a measurement of one house stays one sheet: no panel titles.
 * Finds things by testID; waits on what it checks (no pauses).
 */
const { openView, stands } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  const st = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const place = st.db.properties[0];
  const ft = (n, i = 0) => n * 12 + i;
  const M = (id) => ({ id, label: null, status: "ready", propertyId: place.id, leadId: null, accuracy: "tape", updatedAt: new Date().toISOString() });
  const run = (id, m, a, b) => ({ id, measurementId: m, kind: "run", geom: { a, b }, attrs: {}, confidence: "drawn" });
  st.db.moduleData = st.db.moduleData || {};
  st.db.moduleData.gutters = {
    measurements: [M("e2e256-two"), M("e2e256-one")],
    elements: [
      run("e2e256-a", "e2e256-two", [0, 0], [ft(250, 4), 0]),
      run("e2e256-b", "e2e256-two", [ft(300), 0], [ft(334, 5), 0]),
      run("e2e256-c", "e2e256-two", [ft(334, 5), 0], [ft(334, 5), ft(25, 4)]),
      run("e2e256-d", "e2e256-two", [ft(334, 5), ft(25, 4)], [ft(321), ft(25, 4)]),
      run("e2e256-e", "e2e256-one", [0, 0], [ft(40), 0]),
      run("e2e256-f", "e2e256-one", [ft(40), 0], [ft(40), ft(20)]),
    ],
  };
  await h.seed(KEY, st);

  const view = async (m) => {
    await h.go(`/module/gutters/view?m=${encodeURIComponent(m)}`);
    await tid("view-screen").waitFor({ timeout: 8000 });
    await stands(tid("view-head"));
  };
  const sheetText = () => tid("view-svg").innerText();
  const printed = async (id) => {
    await p.evaluate(() => {
      window.__pdf = null;
      for (const f of document.querySelectorAll("iframe")) f.dataset.seen = "1";
      if (window.__printHooked) return;
      window.__printHooked = true;
      const add = document.body.appendChild.bind(document.body);
      document.body.appendChild = (el) => {
        const r = add(el);
        if (el.tagName === "IFRAME") el.contentWindow.print = () => {};
        return r;
      };
    });
    await tid(id).getByRole("button").click();
    await p.waitForFunction(
      () => {
        const f = [...document.querySelectorAll("iframe:not([data-seen])")].find((x) => x.contentDocument?.body?.innerHTML.includes("<svg"));
        if (f) window.__pdf = f.contentDocument.documentElement.outerHTML;
        return !!window.__pdf;
      },
      null,
      { timeout: 10000 },
    );
    return p.evaluate(() => window.__pdf);
  };

  await view("e2e256-two");
  await p.waitForFunction(() => /Контур 2/.test(document.querySelector('[data-testid="view-svg"]')?.textContent ?? ""), null, { timeout: 8000 });
  const s = await sheetText();
  h.expect(/Контур 1/.test(s) && /Контур 2/.test(s), "two panels: " + s.slice(0, 80));
  h.expect((s.match(/Масштаб/g) || []).length === 2, "each panel has its own scale");
  for (const n of ["250′ 4″", "34′ 5″", "25′ 4″", "13′ 5″"]) h.expect(s.includes(n), `the length ${n}`);
  await h.shot("panels");
  const pdf = await printed("view-pdf-crew");
  h.expect(/Контур 1/.test(pdf) && /Контур 2/.test(pdf), "the crew's PDF has the two panels");

  await view("e2e256-one");
  const one = await sheetText();
  h.expect(!/Контур/.test(one) && (one.match(/Масштаб/g) || []).length === 1, "one house — one sheet, no panels: " + one.slice(0, 60));
};
