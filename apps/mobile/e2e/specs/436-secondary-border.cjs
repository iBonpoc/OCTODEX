/**
 * e2e 436 — the edge of a secondary button is seen (#1728, DS §7.3 «Вторичная», 1.15.6), every view, by testID:
 * a «Связано» chip (Button secondary sm) has a 1 px frame of `bdField` whose contrast to the page under it is ≥ 3:1
 * (WCAG 1.4.11) in both themes — `bd` (≈1.2:1 in the light theme) left the chip without an edge on 390.
 */
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const rgba = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/invoice/i1");
  for (const k of ["job", "customer"]) {
    await tid(`related-${k}`).waitFor({ timeout: 8000 });
    const r = await tid(`related-${k}`).evaluate((e) => {
      const all = [e, ...e.querySelectorAll("*")];
      const framed = all.find((el) => parseFloat(getComputedStyle(el).borderTopWidth) > 0);
      // the page's own colour under the chip (the screen paints it on body / the root)
      return { border: framed ? getComputedStyle(framed).borderTopColor : "", width: framed ? parseFloat(getComputedStyle(framed).borderTopWidth) : 0 };
    });
    h.expect(r.width >= 1, `«${k}» chip has a frame`);
    const [br, bg, bb, ba = 1] = rgba(r.border);
    // the page colour of this theme (tokens: light bg #EFEBE5, dark bg #24272D) under a frame of alpha ba
    const page = h.layout.theme === "light" ? [0xef, 0xeb, 0xe5] : [0x24, 0x27, 0x2d];
    const seen = [br, bg, bb].map((v, i) => v * ba + page[i] * (1 - ba));
    const cr = ratio(seen, page);
    h.expect(cr >= 3, `«${k}» chip frame contrast ${cr.toFixed(2)}:1 ≥ 3:1 (${r.border})`);
  }
  await h.shot("chips");
};
