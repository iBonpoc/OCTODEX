/**
 * e2e 151 — правила и расходники компании, углы, редкие поля водостока (docs/specs/33-gutters-settings.md П22 M7c). Every view.
 * - director, the trial on, «Настройки»: story height 10 → 11 ft, corners by default «Готовый угол», waste 5 → 6 % — saved;
 * - the canvas: an L of two runs → the corner of the picked run is «Готовый угол» (the company's), «Вырезать на месте»
 *   on it → both runs keep the method; a downspout: «Ещё» → «Leader head» and «Отвод в бочку» → in the store;
 *   all of it back after a reload;
 * - the office reads the rules, cannot change them.
 * Finds things by testID; waits on what it checks.
 */
const { openProps, skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  // 390: what is changed seldom sits under «Ещё» (spec 33 П20.9) — open it; 820/1280 show every field
  const more = async () => {
    if (await tid("attr-more").count()) {
      await tid("attr-more").getByRole("button").click();
      await tid("attr-more-open").waitFor({ timeout: 5000 });
    }
  };
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {}, KEY);
  const settings = async () => ((await db()).company?.modules?.gutters?.settings) || {};
  const stored = async () => ((await db()).moduleData?.gutters?.elements) || [];
  const chosen = (field) => tid(field).locator('[aria-checked="true"]').innerText();
  const choose = (field, name) => tid(field).getByRole("radio", { name, exact: true }).click();
  /** the n-th chip of a field (0-based) and which one is chosen — by place, not by its words (rule 19) */
  const nth = (field, n) => tid(field).getByRole("radio").nth(n);
  const chosenAt = (field) => tid(field).getByRole("radio").evaluateAll((rs) => rs.findIndex((r) => r.getAttribute("aria-checked") === "true"));
  // corner chips: 0 — the company's, 1 — field cut, 2 — + strip miter, 3 — ready-made
  const svg = () => p.getByTestId("draw-svg").first();
  const panel = () => tid("attr-panel");
  const openAttrs = async () => {
    // a downspout just put opens its menu by itself (founder 09.11)
    if (!wide && !(await panel().count())) await openProps(p);
    await panel().waitFor({ timeout: 5000 });
  };
  const closeAttrs = async () => {
    if (wide) return;
    await p.getByRole("button", { name: "Закрыть", exact: true }).first().click({ position: { x: 10, y: 10 } });
    await waitFor(async () => (await panel().count()) === 0, "the sheet is closed");
  };
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
    await p.waitForTimeout(200);
  };

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");

  // the rules
  await h.go("/module/gutters/settings");
  await tid("gset-rules").waitFor({ timeout: 5000 });
  await tid("gset-rule-storyFt").scrollIntoViewIfNeeded();
  h.expect(/10/.test(await tid("gset-rule-storyFt").innerText()), "story height 10 ft by default");
  await tid("gset-rule-storyFt").getByRole("button", { name: "Высота этажа +1" }).click();
  await waitFor(async () => (await settings()).rules?.storyFt === 11, "story height 11 ft saved");
  // waste (#1355): a fixed 10 ft for the whole measurement by default; a switch takes it away («без запаса» = 0); «Процентом» is still a choice
  h.expect(/10/.test(await tid("gset-rule-wasteFt").innerText()), "waste: 10 ft by default");
  await tid("gset-rule-wasteFt").getByRole("button", { name: "Запас на отход +1" }).click();
  await waitFor(async () => (await settings()).rules?.wasteFt === 11, "waste 11 ft saved");
  await tid("gset-rule-wasteOn").getByRole("switch").click();
  await waitFor(async () => (await settings()).rules?.wasteFt === 0, "«Считать запас» off: 0 ft saved");
  await waitFor(async () => (await tid("gset-rule-wasteFt").count()) === 0, "…and the number goes away");
  await tid("gset-rule-wasteOn").getByRole("switch").click();
  await waitFor(async () => (await settings()).rules?.wasteFt === 11, "on again: the 11 ft the company had, not the default");
  // in percent: its own number (10 % by default), saved apart; the feet stay as they were
  await tid("gset-rule-wasteMode").getByRole("radio", { name: "Процентом", exact: true }).click();
  await waitFor(async () => (await settings()).rules?.wasteMode === "pct", "«Процентом» saved");
  await tid("gset-rule-wastePct").getByRole("button", { name: "Запас на отход +1" }).click();
  await waitFor(async () => (await settings()).rules?.wastePct === 11, "waste 11 % saved");
  await tid("gset-rule-wasteMode").getByRole("radio", { name: "Футами", exact: true }).click();
  await waitFor(async () => (await settings()).rules?.wasteMode === "ft" && (await settings()).rules?.wasteFt === 11, "back to feet: 11 ft");
  // the corner allowance by kind: an outside corner 14″, an inside one 6″
  h.expect(/14/.test(await tid("gset-rule-cutCornerOutIn").innerText()) && /6/.test(await tid("gset-rule-cutCornerIn").innerText()), "an outside corner 14″, an inside one 6″ by default");
  await tid("gset-rule-cutCornerOutIn").getByRole("button", { name: /\+1$/ }).click();
  await waitFor(async () => (await settings()).rules?.cutCornerOutIn === 15, "outside corner 15″ saved");
  await nth("gset-rule-corner", 2).click();
  await waitFor(async () => (await settings()).rules?.corner === "prefab", "corners by default: ready-made");
  await h.shot("rules");

  // an L on the canvas
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.3;
  const x0 = b.x + b.width * 0.1;
  const x1 = b.x + b.width * 0.5;
  await stroke([x0, y], [x1, y]);
  await stroke([x1, y], [x1, y + b.height * 0.3]);
  await waitFor(async () => (await svg().locator("line:not([id^=halo])").count()) === 2, "two runs");
  // the new run is picked: its corner
  await openAttrs();
  await more();
  await tid("attr-corner-0").waitFor({ timeout: 5000 });
  h.expect((await chosenAt("attr-corner-0")) === 0, "the corner follows the company («Как у компании»)");
  await nth("attr-corner-0", 1).click();
  await waitFor(async () => (await chosenAt("attr-corner-0")) === 1, "this corner: field cut");
  await waitFor(async () => {
    const runs = (await stored()).filter((e) => e.kind === "run");
    return runs.length === 2 && runs.every((r) => r.attrs.cornerMethod && Object.values(r.attrs.cornerMethod).includes("cut"));
  }, "the store: both runs keep the corner's method");
  await h.shot("corner");
  await closeAttrs();

  // a downspout: the rare fields
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click(b.x + b.width * 0.25, y + 3);
  await waitFor(async () => (await svg().locator("circle").count()) === 1, "a downspout");
  await openAttrs();
  await tid("attr-more").getByRole("button").click();
  await tid("attr-more-open").waitFor({ timeout: 5000 });
  await nth("attr-head", 2).click();
  await tid("attr-diverter").getByRole("switch").click();
  await waitFor(async () => {
    const d = (await stored()).find((e) => e.kind === "downspout");
    return d && d.attrs.head === "conductor" && d.attrs.diverter === true;
  }, "the store: leader head and diverter");
  await h.shot("downspout");

  // a reload: the corner and the downspout are back
  await p.waitForTimeout(1300);
  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await svg().locator("circle").count()) === 1, "after a reload: the downspout");
  const at = await svg().locator("circle").first().evaluate((c) => {
    const r = c.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  await tid("draw-tool-line").getByRole("button").click();
  await p.mouse.click(at[0], at[1]);
  await waitFor(async () => (await tid("draw-selected").count()) > 0, "the downspout picked");
  await openAttrs();
  await tid("attr-more-open").waitFor({ timeout: 5000 });
  h.expect((await chosenAt("attr-head")) === 2, "after a reload: the leader head, «Ещё» open by itself");
  // and the corner: pick the first run (its middle) — the corner kept its own method
  if (!wide) await closeAttrs();
  const mid = await svg().locator("line:not([id^=halo])").first().evaluate((l) => {
    const r = l.ownerSVGElement.getBoundingClientRect();
    const n = (k) => Number(l.getAttribute(k));
    return [r.x + (n("x1") + n("x2")) / 2, r.y + (n("y1") + n("y2")) / 2];
  });
  await p.mouse.click(mid[0], mid[1]);
  await waitFor(async () => /Желоб/.test((await tid("draw-selected").count()) ? await tid("draw-selected").innerText() : ""), "a run picked");
  await openAttrs();
  await more();
  await tid("attr-corner-0").waitFor({ timeout: 5000 });
  h.expect((await chosenAt("attr-corner-0")) === 1, "after a reload: the corner is field cut");

  // the office: read only (the role is switched on a plain page: the canvas page writes the app's state as it leaves)
  await h.go("/today");
  await setRole(h, "dispatcher");
  await h.go("/module/gutters/settings");
  await tid("gset-rules").waitFor({ timeout: 5000 });
  await tid("gset-ro").waitFor({ timeout: 5000 });
  await tid("gset-rule-storyFt").scrollIntoViewIfNeeded();
  h.expect(/11/.test(await tid("gset-rule-storyFt").innerText()), "the office sees 11 ft");
  // the stepper is off for the office: a press changes nothing (its disabled state is not an attribute on the web)
  await tid("gset-rule-storyFt").getByRole("button", { name: "Высота этажа +1" }).click({ force: true });
  await p.waitForTimeout(600);
  const after = [(await settings()).rules?.storyFt, await tid("gset-rule-storyFt").innerText()];
  h.expect(after[0] === 11 && /11/.test(after[1]), `the office cannot change it (${JSON.stringify(after)})`);
  await h.shot("office");
};
