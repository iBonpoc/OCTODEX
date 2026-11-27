/**
 * e2e 260 — material, profile and thickness of a gutter are dropdowns, the size row is as wide as its content
 * (#677 founder 09.11: «Материал, профиль, толщина — селекторы»; «Строка "Размер" слишком широкая»). Every view.
 * Finds things by testID; waits on what it checks (no pauses).
 */
const { openProps, skipLength, pickAttr, attrShown, attrKeys, attrChosen, openAttrMore } = require("../gutters.cjs");

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
  if (!wide) await openProps(p);
  await tid("attr-panel").waitFor({ timeout: 5000 });
  await openAttrMore(p); // the material and the gauge are under «Ещё» (#2412 G1)
  for (const f of ["attr-material", "attr-size", ...((await tid("attr-gauge-button").count()) ? ["attr-gauge"] : [])]) {
    await tid(`${f}-button`).waitFor({ timeout: 5000 });
    h.expect((await tid(f).getByRole("radio").count()) === 0, `${f}: closed — a field, no chips`);
  }
  // the size field shares its row (Размер · Цвет · Этаж): narrower than a full row
  const size = await tid("attr-size-button").boundingBox();
  const mat = await tid("attr-material-button").boundingBox();
  const full = await tid("attr-color-button").boundingBox(); // the colour has a row of its own
  h.expect(size.width < full.width * 0.8, `the size field is narrower than the full row (${Math.round(size.width)} vs ${Math.round(full.width)})`);
  // the material and the gauge share one row (founder 27.11, #2984: «в одну линию на одной строке»)
  if (await tid("attr-gauge-button").count()) {
    const g = await tid("attr-gauge-button").boundingBox();
    h.expect(Math.abs(g.y - mat.y) < 2 && g.x > mat.x + mat.width - 1, `material · gauge in one row (${Math.round(mat.y)} / ${Math.round(g.y)})`);
  }
  // the profile: tiles with icons (#2986) — a pick checks it and the window says it
  const profiles = await attrKeys(p, "attr-profile");
  h.expect(profiles.length >= 2 && (await tid("attr-profile-button").count()) === 0, `the profile tiles (${profiles.length})`);
  const before = await attrChosen(p, "attr-profile");
  const other = profiles.find((k) => k !== before);
  const name = await pickAttr(p, "attr-profile", other);
  h.expect((await attrShown(p, "attr-profile")) === name, `the field shows the pick: ${name}`);
  await h.shot("dropdowns");

  // the settings (#931): every field either a segment in ONE line, or a closed dropdown (`<id>-button`, no chips); a pick is saved
  await h.go("/module/gutters/settings");
  await tid("gset-def-run").waitFor({ timeout: 8000 });
  const fields = ["gset-run-profile", "gset-run-size", "gset-run-material", "gset-run-gauge", "gset-ds-shape", "gset-ds-size", "gset-ds-style", "gset-ds-material", "gset-ds-gauge"];
  const kinds = {};
  for (const f of fields) {
    const button = p.getByTestId(`${f}-button`).locator("visible=true");
    const options = p.locator(`[data-testid^="${f}-"]:not([data-testid="${f}-button"]):not([data-testid$="-warn"])`).locator("visible=true");
    if (!(await button.count()) && !(await options.count())) {
      h.expect(/gauge/.test(f), `${f} is on the page`); // a thickness is offered only for a material that has one
      continue;
    }
    if (await button.count()) {
      await button.scrollIntoViewIfNeeded();
      h.expect((await p.getByTestId(f).getByRole("radio").count()) === 0, `${f}: a closed dropdown shows no chips`);
      kinds[f] = "select";
    } else {
      await options.first().scrollIntoViewIfNeeded();
      const ys = await options.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      h.expect(ys.length >= 2 && ys.every((v) => Math.abs(v - ys[0]) <= 2), `${f}: the segment stands in one line (${ys.join(",")})`);
      kinds[f] = "segment";
    }
  }
  h.expect(Object.values(kinds).includes("select") && Object.values(kinds).includes("segment") || Object.keys(kinds).length >= 7, "the fields are found: " + JSON.stringify(kinds));
  // a pick is kept: a dropdown (first one) and a segment (first one) — change, reload, the same value
  const dd = Object.keys(kinds).find((f) => kinds[f] === "select");
  if (dd) {
    await tid(`${dd}-button`).scrollIntoViewIfNeeded();
    const was = (await tid(`${dd}-button`).innerText()).trim();
    await tid(`${dd}-button`).click();
    const items = p.locator(`[data-testid^="${dd}-"]:not([data-testid="${dd}-button"])`).locator("visible=true");
    await items.first().waitFor({ timeout: 5000 });
    const names = await items.allInnerTexts();
    const i = names.findIndex((x) => x.trim() && !was.includes(x.trim()));
    h.expect(i >= 0, `${dd}: the menu has another value`);
    const want = names[i].trim();
    await items.nth(i).click();
    await p.waitForFunction(([id, w]) => (document.querySelector(`[data-testid="${id}-button"]`)?.textContent || "").includes(w), [dd, want], { timeout: 5000 });
    await h.go("/module/gutters/settings");
    await tid(`${dd}-button`).waitFor({ timeout: 8000 });
    h.expect((await tid(`${dd}-button`).innerText()).includes(want), `${dd}: «${want}» is kept after a reload`);
  }
  const sg = Object.keys(kinds).find((f) => kinds[f] === "segment");
  if (sg) {
    const opts = p.locator(`[data-testid^="${sg}-"]:not([data-testid="${sg}-button"]):not([data-testid$="-warn"])`).locator("visible=true");
    await opts.first().scrollIntoViewIfNeeded();
    const n = await opts.count();
    let pick = -1;
    for (let i = 0; i < n; i++) if ((await opts.nth(i).getAttribute("aria-checked")) !== "true") { pick = i; break; }
    h.expect(pick >= 0, `${sg}: another option`);
    const id = await opts.nth(pick).getAttribute("data-testid");
    await opts.nth(pick).click();
    await p.waitForFunction((x) => document.querySelector(`[data-testid="${x}"]`)?.getAttribute("aria-checked") === "true", id, { timeout: 5000 });
    await h.go("/module/gutters/settings");
    await tid("gset-def-run").waitFor({ timeout: 8000 });
    await p.waitForFunction((x) => document.querySelector(`[data-testid="${x}"]`)?.getAttribute("aria-checked") === "true", id, { timeout: 8000 });
  }
};
