/**
 * The bigger system text (DS §4.3, #2761): one step bigger (iOS Dynamic Type 1.25, `e2e/fontScale.cjs`), every view.
 * - A lead's quick actions (`IconRow`): no caption is broken inside a word («Позвони / ть», «Маршру / т» were) — a caption
 *   has no more lines than words; the circles stay on one line and inside the screen.
 * - The object's name and its status on the right of the rule do not cross.
 */
const { useFontScale } = require("../fontScale.cjs");

exports.run = async (h) => {
  const p = h.page;
  await useFontScale(p, 1.25);
  await h.go("/lead/l1");
  const row = p.getByTestId("lead-screen-actions").locator("visible=true").first();
  await row.waitFor({ timeout: 5000 });
  await p.getByTestId("lead-call").locator("visible=true").first().waitFor();
  const cells = await row.evaluate((r) => {
    const out = [];
    for (const cell of r.querySelectorAll(":scope [data-testid^='lead-']")) {
      const label = [...cell.querySelectorAll("*")].find((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
      if (!label) continue;
      const range = document.createRange();
      range.selectNodeContents(label);
      const tops = new Set([...range.getClientRects()].filter((b) => b.width > 0).map((b) => Math.round(b.top)));
      const c = cell.getBoundingClientRect();
      out.push({ text: label.textContent.trim(), lines: tops.size, words: label.textContent.trim().split(/\s+/).length, left: c.left, right: c.right });
    }
    return { out, vw: window.innerWidth };
  });
  h.expect(cells.out.length >= 3, `the row has its captions (${cells.out.length})`);
  for (const c of cells.out) h.expect(c.lines <= c.words, `«${c.text}» is not broken inside a word (${c.lines} lines, ${c.words} words)`);
  for (const c of cells.out) h.expect(c.left >= 0 && c.right <= cells.vw + 0.5, `«${c.text}» stays on the screen (${Math.round(c.left)}–${Math.round(c.right)} of ${cells.vw})`);

  // the name and the status right of the rule do not cross
  const name = p.getByTestId("screen-title").locator("visible=true").first();
  const rule = p.getByTestId("screen-head-rule").locator("visible=true").first();
  await rule.waitFor({ timeout: 3000 });
  const n = await name.evaluate((el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return Math.max(...[...r.getClientRects()].filter((b) => b.width > 0).map((b) => b.right));
  });
  const ruleBox = await rule.boundingBox();
  h.expect(n <= ruleBox.x + 0.5, `the name ends before the rule (${Math.round(n)} ≤ ${Math.round(ruleBox.x)})`);
  await h.shot("lead");
};
