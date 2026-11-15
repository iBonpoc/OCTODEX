/**
 * e2e 315 — what a chosen item LOOKS like (DS «Выделение выбранного», «Заливка», #1306), every view, by role and testID, not only
 * `selected`: the chosen filter chip has a fill and a shadow, the unchosen has none; neither is the main action's yellow; a chosen
 * day of the week strip carries the check.
 */
const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).map(Number);
const clear = (s) => { const v = rgb(s); return v.length < 3 || (v.length === 4 && v[3] === 0); };
exports.run = async (h) => {
  const p = h.page;
  await h.go("/estimates");
  const bar = p.getByTestId("filter-bar").locator("visible=true").first();
  await bar.waitFor({ timeout: 8000 });
  // the Pressable is the outer node; the chip's own style is on the node inside it: the first with a fill, else the outer one
  const look = (sel) => bar.locator(`[role="radio"][aria-checked="${sel}"]`).first().evaluate((el) => {
    const nodes = [el, ...el.querySelectorAll("*")].map((n) => getComputedStyle(n));
    const solid = nodes.find((st) => !/rgba\(0, 0, 0, 0\)|transparent/.test(st.backgroundColor));
    const st = solid ?? nodes[0];
    const shadowed = nodes.find((x) => x.boxShadow && x.boxShadow !== "none");
    return { bg: solid ? st.backgroundColor : "rgba(0, 0, 0, 0)", shadow: shadowed ? shadowed.boxShadow : "none" };
  });
  const on = await look(true);
  const off = await look(false);
  h.expect(!clear(on.bg), `the chosen chip has a fill (${on.bg})`);
  h.expect(on.shadow && on.shadow !== "none", `the chosen chip has the small shadow (${on.shadow})`);
  h.expect(clear(off.bg), `the unchosen chip has no fill (${off.bg})`);
  h.expect(!off.shadow || off.shadow === "none", "the unchosen chip has no shadow");
  const [r, g, b] = rgb(on.bg);
  h.expect(!(r > 200 && g > 200 && b < 90), `the fill is not the yellow accent (${on.bg})`);
  // the week strip: a chosen day carries the check, the others do not
  await h.seed("octo.planMode.v1", "week");
  await h.go("/plan");
  await p.getByTestId("plan-week-strip").locator("visible=true").first().waitFor({ timeout: 8000 });
  const days = p.locator('[data-testid^="plan-day-"]').locator("visible=true");
  await days.first().waitFor({ timeout: 8000 });
  h.expect((await p.locator('[data-testid^="plan-day-"] [data-testid="selected-check"]').locator("visible=true").count()) === 1, "one chosen day carries the check");
  await h.shot("fill");
};
