/**
 * Rule 2 / unslop 05.11: at most one visible yellow (acc) element on a screen — the main action — besides the «＋» of
 * the tab bar. Used by the specs of the screens already fixed (11, 12, 21); 08-layouts gets it when all screens are.
 */
const ACC = "rgb(251, 255, 0)"; // design-tokens: acc #FBFF00 (both themes)

exports.accentCount = (page) =>
  page.evaluate((acc) => {
    const seen = [];
    for (const el of document.querySelectorAll("body *")) {
      const st = getComputedStyle(el);
      if (st.backgroundColor !== acc || st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
      if (el.closest('[aria-label="Создать"], [aria-label="Create"], [aria-label="Crear"]')) continue; // «＋» of the tab bar
      if (seen.some((s) => s.contains(el) || el.contains(s))) continue;
      seen.push(el);
    }
    return seen.length;
  }, ACC);

exports.expectOneAccent = async (h, where) => {
  await h.page.waitForTimeout(300);
  const n = await exports.accentCount(h.page);
  h.expect(n <= 1, `one yellow on ${where} (rule 2), found ${n}`);
};
