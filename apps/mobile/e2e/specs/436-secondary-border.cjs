/**
 * e2e 436 — a secondary button is seen (#1728, DS §7.3 «Вторичная»), every view, by testID.
 * v2 (#2350, DS §12.12, controls.tsx Button): a secondary button has NO frame — it is told by its own cell (`surf2`) and its yellow
 * words (`accText`); WCAG 1.4.11 is met by the words: on the «Связано» chip (Button secondary sm) the words are ≥ 4.5:1 to the
 * chip's cell in both themes, and the cell is not the page colour (the chip is not a bare word on the screen).
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
      const filled = all.find((el) => { const b = getComputedStyle(el).backgroundColor; return b && b !== "transparent" && b !== "rgba(0, 0, 0, 0)"; });
      const word = all.find((el) => el.childElementCount === 0 && (el.textContent || "").trim().length > 1);
      const framed = all.find((el) => parseFloat(getComputedStyle(el).borderTopWidth) > 0 && getComputedStyle(el).borderTopColor !== "rgba(0, 0, 0, 0)");
      // the page's colour under the chip: the first painted ancestor
      let pg = "";
      for (let a = e.parentElement; a && !pg; a = a.parentElement) { const b = getComputedStyle(a).backgroundColor; if (b && b !== "transparent" && b !== "rgba(0, 0, 0, 0)") pg = b; }
      return { cell: filled ? getComputedStyle(filled).backgroundColor : "", ink: word ? getComputedStyle(word).color : "", frame: !!framed, page: pg || getComputedStyle(document.body).backgroundColor };
    });
    h.expect(!!r.cell, `«${k}» chip has its own cell`);
    h.expect(!r.frame, `«${k}» chip: no frame (v2)`);
    h.expect(r.cell !== r.page, `«${k}» chip's cell is not the page colour (${r.cell} / ${r.page})`);
    const cr = ratio(rgba(r.ink).slice(0, 3), rgba(r.cell).slice(0, 3));
    h.expect(cr >= 4.5, `«${k}» chip words contrast ${cr.toFixed(2)}:1 ≥ 4.5:1 (${r.ink} on ${r.cell})`);
  }
  await h.shot("chips");
};
