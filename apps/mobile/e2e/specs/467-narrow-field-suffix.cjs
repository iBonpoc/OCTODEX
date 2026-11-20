/**
 * e2e 467 — #1990: a narrow field with a unit (two in a row on a phone). The browser's <input> does not shrink below its own
 * width by itself, so the unit stood out of the frame over the next field; the field takes `minWidth: 0` now. Every view:
 * the unit of each field lies inside its own frame, and the two frames do not overlap. Showcase «Поля», by testID.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/settings/design-system/fields");
  const row = p.getByTestId("showcase-num-narrow").locator("visible=true").first();
  await row.waitFor({ timeout: 8000 });
  await row.scrollIntoViewIfNeeded();
  const boxes = await p.evaluate(() => {
    const vis = (id) => [...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.offsetParent !== null);
    const frameOf = (input) => {
      // the frame: the nearest parent with a border
      let a = input.parentElement;
      while (a && !(parseFloat(getComputedStyle(a).borderTopWidth) > 0)) a = a.parentElement;
      return a;
    };
    return ["showcase-num-ft", "showcase-num-in"].map((id) => {
      const root = vis(id);
      const input = root.querySelector("input");
      const frame = frameOf(input);
      const f = frame.getBoundingClientRect();
      // the unit: the last text in the frame after the input
      const unit = [...frame.querySelectorAll("div[dir='auto']")].filter((d) => /^(ft|in)$/.test(d.textContent.trim())).pop();
      const u = unit.getBoundingClientRect();
      return { id, frame: { l: f.left, r: f.right }, unit: { l: u.left, r: u.right, text: unit.textContent.trim() } };
    });
  });
  for (const b of boxes) {
    h.expect(b.unit.l >= b.frame.l - 0.5 && b.unit.r <= b.frame.r + 0.5, `${b.id}: «${b.unit.text}» inside its frame (${JSON.stringify(b)})`);
  }
  h.expect(boxes[0].frame.r <= boxes[1].frame.l + 0.5, `the two frames do not overlap (${boxes[0].frame.r} / ${boxes[1].frame.l})`);
  await h.shot("narrow");
};
