/**
 * e2e 260 — material, profile and thickness of a gutter are dropdowns, the size row is as wide as its content
 * (#677 founder 09.11: «Материал, профиль, толщина — селекторы»; «Строка "Размер" слишком широкая»). Every view.
 * Finds things by testID; waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").waitFor({ timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  await p.mouse.move(b.x + b.width * 0.08, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.08 + (0.37 * i) / 12), y);
  await p.mouse.up();
  await skipLength(p);
  if (!wide) await tid("draw-props").getByRole("button").click();
  await tid("attr-panel").waitFor({ timeout: 5000 });
  if (await tid("attr-more").count()) {
    await tid("attr-more").getByRole("button").click();
    await tid("attr-more-open").waitFor({ timeout: 5000 });
  }
  for (const f of ["attr-material", "attr-profile", "attr-size"]) {
    await tid(`${f}-value`).waitFor({ timeout: 5000 });
    h.expect((await tid(f).getByRole("radio").count()) === 0, `${f}: closed — a dropdown row, no chips`);
  }
  // the size row is as wide as what it shows, not the whole panel
  const size = await tid("attr-size-open").boundingBox();
  const mat = await tid("attr-material-open").boundingBox();
  h.expect(size.width < mat.width * 0.8, `the size row is narrower than the full row (${Math.round(size.width)} vs ${Math.round(mat.width)})`);
  // a pick closes the list and the row shows it
  await tid("attr-profile-open").click();
  const profiles = await tid("attr-profile").getByRole("radio").count();
  h.expect(profiles >= 2, `the profile list opens (${profiles})`);
  const before = (await tid("attr-profile-value").innerText()).trim();
  const other = tid("attr-profile").getByRole("radio").filter({ hasNotText: before }).first();
  const name = (await other.innerText()).trim();
  await other.click();
  await p.waitForFunction((id) => !document.querySelector(`[data-testid="${id}"] [role="radio"]`), "attr-profile", { timeout: 5000 });
  h.expect((await tid("attr-profile-value").innerText()).trim() === name, `the row shows the pick: ${name}`);
  await h.shot("dropdowns");

  // the settings (#931): the same fields never stand in two lines — a segment in one row or a closed dropdown
  await h.go("/module/gutters/settings");
  await tid("gset-def-run").waitFor({ timeout: 8000 });
  for (const f of ["gset-run-profile", "gset-run-size", "gset-run-material", "gset-ds-shape", "gset-ds-size", "gset-ds-material"]) {
    // a segment carries the id itself; a dropdown — its `-button` (and no chips at all)
    // a segment: one element per option, `<id>-<key>`; a dropdown: the closed `<id>-button` and no options
    const opts = p.locator(`[data-testid^="${f}-"]:not([data-testid="${f}-button"])`).locator("visible=true");
    if (await opts.count()) await opts.first().scrollIntoViewIfNeeded();
    const ys = await opts.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    h.expect(ys.every((v) => Math.abs(v - ys[0]) <= 2), `${f}: its options stand in one line (${ys.join(",")})`);
  }
};
