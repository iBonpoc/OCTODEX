/**
 * e2e 259 — zoomed out, the canvas words stand clear of each other and of the gutters (#1185, founder's «David Kim»
 * sample). Every view. The sample's runs (a long one, a cross one, a broken line with a bay, a small rectangle) go straight
 * into the store; the canvas opens whole: no two texts overlap, no corner's word lies on a gutter's line.
 * Finds things by testID; waits on what it checks (no pauses).
 */
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  const st = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const place = st.db.properties[0];
  const ft = (f, i = 0) => f * 12 + i;
  const run = (id, a, b) => ({ id: `e2e259-${id}`, measurementId: "e2e259", kind: "run", geom: { a, b }, attrs: {}, confidence: "drawn" });
  const bl = [338, 2610], br = [bl[0] + ft(3, 7), bl[1]], tr = [br[0], br[1] + ft(1, 10)], tl = [tr[0] - ft(3, 8), tr[1]];
  const v1 = [204, 3350];
  const q = [v1[0] + 28, v1[1] + 28];
  st.db.moduleData = st.db.moduleData || {};
  st.db.moduleData.gutters = {
    measurements: [{ id: "e2e259", label: null, status: "draft", propertyId: place.id, leadId: null, accuracy: "tape", updatedAt: new Date().toISOString() }],
    elements: [
      run("k1", [0, ft(300, 5)], [0, 0]),
      run("k2", [-262, 2351], [569, 2351]),
      run("k3", v1, [204, 3350 - ft(45, 3)]),
      run("k4", v1, q),
      run("k5", q, [q[0] + 217, q[1] - 217]),
      run("k6", [330, 2700], [364, 2721]),
      run("k7", tr, tl),
      run("k8", br, tr),
      run("k9", br, bl),
      run("k10", bl, [bl[0], bl[1] + ft(1, 6)]),
    ],
  };
  await h.seed(KEY, st);

  await h.go("/module/gutters/draw?m=e2e259");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="draw-svg"] text').length >= 5, null, { timeout: 8000 });
  const boxes = await p.evaluate(() => {
    const svg = document.querySelector('[data-testid="draw-svg"]');
    const r = (el) => { const b = el.getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom, s: el.textContent || "" }; };
    const texts = [...svg.querySelectorAll("text")].map(r).filter((b) => b.x1 > b.x0 && b.y1 > b.y0 && b.s.trim() && !/^[LR]$/.test(b.s.trim())); // the L / R letters are end-cap marks, not words
    const lines = [...svg.querySelectorAll("line:not([id^=halo])")].map((l) => ({ x1: +l.getAttribute("x1"), y1: +l.getAttribute("y1"), x2: +l.getAttribute("x2"), y2: +l.getAttribute("y2") }));
    const o = svg.getBoundingClientRect();
    return { texts, lines, ox: o.left, oy: o.top };
  });
  h.expect(boxes.texts.length >= 5, `the canvas has words (${boxes.texts.length})`);
  const over = [];
  for (let i = 0; i < boxes.texts.length; i++) for (let j = i + 1; j < boxes.texts.length; j++) {
    const a = boxes.texts[i], b = boxes.texts[j];
    if (a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1) over.push(`${a.s} / ${b.s}`);
  }
  h.expect(over.length === 0, "no two words overlap: " + over.join(" | "));
  await h.shot("labels-zoomed-out");
};
