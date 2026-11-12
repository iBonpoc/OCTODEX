/**
 * e2e 261 — a short gutter on the sheet gets an enlarged inset (#1190, the founder's «David Kim» sample: 3′ 3″ next to 45′).
 * Every view. A long run, a bay of 3′ 3″ at its end and one more run go straight into the store; «Просмотр» shows the
 * short one in a frame «№N» with its length once, and the crew's PDF carries it too.
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
  const ft = (n, i = 0) => n * 12 + i;
  const run = (id, a, b) => ({ id: `e2e261-${id}`, measurementId: "e2e261", kind: "run", geom: { a, b }, attrs: {}, confidence: "drawn" });
  st.db.moduleData = st.db.moduleData || {};
  st.db.moduleData.gutters = {
    measurements: [{ id: "e2e261", label: null, status: "ready", propertyId: place.id, leadId: null, accuracy: "tape", updatedAt: new Date().toISOString() }],
    elements: [
      run("a", [0, 0], [0, ft(45, 3)]),
      run("b", [0, ft(45, 3)], [ft(2, 4), ft(47, 7)]),
      run("c", [ft(2, 4), ft(47, 7)], [ft(20), ft(30)]),
    ],
  };
  await h.seed(KEY, st);
  await h.go("/module/gutters/view?m=e2e261");
  await tid("view-screen").waitFor({ timeout: 8000 });
  await p.waitForFunction(() => /№2/.test(document.querySelector('[data-testid="view-svg"]')?.textContent ?? ""), null, { timeout: 8000 });
  const s = await tid("view-svg").innerText();
  h.expect((s.match(/№\d/g) || []).length === 1, "one inset: " + s.slice(0, 120));
  h.expect(/45′ 3″/.test(s), "the long gutter's length stays on the sheet");
  h.expect((s.match(/3′ 4″/g) || []).length === 1, "the short one's length stands once, in the inset");
  await h.shot("inset");
  // the crew's PDF carries the same inset (one sheet for the view and the paper)
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
  const pdf = await p.evaluate(() => window.__pdf);
  const sheet = (pdf.match(/<svg[\s\S]*?<\/svg>/g) || []).join("");
  h.expect(/№2/.test(sheet) && (sheet.match(/>3′ 4″</g) || []).length === 1, "the PDF's sheet: the inset «№2» and the short one's length once");
};
