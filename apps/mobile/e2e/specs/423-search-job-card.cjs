/**
 * e2e 423 — «Искать везде»: the title of a result card keeps its width (#1418, DS §4.3, §5.5), the director, every view, by testID:
 * the line «why it was found» (client · address · «найдено: клиент») must not eat the title's column: the job's name stands on
 * words in at most 3 lines and its box is at least half the card wide (before the fix on 390 it was one letter wide).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/search?q=mitchell");
  await p.getByTestId("search-hit").locator("visible=true").first().waitFor({ timeout: 8000 });
  const r = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid="search-hit"]')].filter((e) => e.offsetParent !== null);
    const card = cards.find((c) => /Bathroom remodel/.test(c.textContent || ""));
    if (!card) return { missing: true };
    const leaf = [...card.querySelectorAll("*")].filter((e) => e.children.length === 0 && /^Bathroom remodel/.test(e.textContent || "")).sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
    const b = leaf.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(leaf).lineHeight) || 20;
    return { cardW: card.getBoundingClientRect().width, w: b.width, lines: Math.round(b.height / lh) };
  });
  await h.shot("search");
  h.expect(!r.missing, "the job «Bathroom remodel» is among the results of «mitchell»");
  h.expect(r.w >= r.cardW * 0.4, `the job's title is not squeezed: ${Math.round(r.w)} of ${Math.round(r.cardW)}`);
  h.expect(r.lines <= 3, `the job's title wraps by words in at most 3 lines (${r.lines})`);
};
