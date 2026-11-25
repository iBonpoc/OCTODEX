/**
 * e2e 315 — what a chosen item LOOKS like (DS «Выделение выбранного», «Заливка», #1306), every view, by role and testID, not only
 * `selected`: the chosen filter chip has a fill and a shadow, the unchosen has none; neither is the main action's yellow; the picked
 * day of the Plan's strip (v2: pills, no week strip) is the one with the accent edge.
 */
const rgb = (s) => (s.match(/\d+(\.\d+)?/g) || []).map(Number);
const clear = (s) => { const v = rgb(s); return v.length < 3 || (v.length === 4 && v[3] === 0); };
exports.run = async (h) => {
  const p = h.page;
  // (v2 #2350: the estimates list has the ListScreen chips «Все 7», not the filter bar; the catalog keeps the filter bar)
  await h.go("/catalog");
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
  // the Plan's day strip (v2 #2350: CalendarScreen — the week strip with the check is gone; BUILD-SPEC §1 DayStrip): the picked pill is
  // «Заливка» (tint) with the accent edge — exactly one; a press on another day moves it there
  await h.go("/plan");
  const pills = p.locator('[data-testid^="plan-strip-"]').locator("visible=true");
  await pills.first().waitFor({ timeout: 8000 });
  const edged = () => p.locator('[data-testid^="plan-strip-"]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height > 0).filter((e) => [e, ...e.querySelectorAll("*")].map((n) => getComputedStyle(n)).some((st) => parseFloat(st.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(st.borderTopColor))).map((e) => e.getAttribute("data-testid")));
  const picked = await edged();
  h.expect(picked.length === 1, `one picked day carries the edge (${picked.join(" ")})`);
  const other = (await pills.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).find((x) => x !== picked[0]);
  await p.getByTestId(other).locator("visible=true").first().click();
    await p.waitForFunction((id) => { const e = document.querySelector(`[data-testid="${id}"]`); return !!e && [e, ...e.querySelectorAll("*")].map((n) => getComputedStyle(n)).some((st) => parseFloat(st.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(st.borderTopColor)); }, other, { timeout: 3000 });
  h.expect((await edged()).join(" ") === other, "the pick moved: one picked day, the pressed one");
  await h.shot("fill");
};
