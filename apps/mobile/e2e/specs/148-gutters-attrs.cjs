/**
 * e2e 148 — панель атрибутов холста Gutters (docs/specs/33-gutters-screens.md П21.8 M5c; спека 33 §7). Every view.
 * - 390: «Свойства» in the picked bar opens the sheet; 820/1280: the panel is a column right of the canvas (not over
 *   it: drawing goes on beside it), says how to pick when nothing is picked, no «Свойства» button, «Закрыть» unpicks;
 * - a run: drawn → profile «Полукруглый» (size 5″, hanger Shank #10 follow), colour «Коричневый», the tape
 *   25′ 6″ → «По рисунку» offered, the label and the $ follow; a bad tape (12 in) says so and changes nothing;
 *   «Назад» on the canvas takes the tape back;
 * - a downspout: «Круглый» → size 3″; wall «Кирпич» → its default wall kit;
 * - everything is in the store (DB.moduleData.gutters) and comes back after a reload.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

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
  const svg = () => p.getByTestId("draw-svg").first();
  const labels = () => svg().locator("text").evaluateAll((ts) => ts.map((t) => t.textContent || ""));
  const money = async () => Number((await tid("draw-money").innerText()).replace(/[^\d.]/g, ""));
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
    await p.waitForTimeout(200);
  };
  const stored = () =>
    p.evaluate((k) => {
      const g = (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters;
      return g ? g.elements : [];
    }, KEY);
  const panel = () => tid("attr-panel");
  /** the chosen chip of a field */
  const chosen = (field) => tid(field).locator('[aria-checked="true"]').innerText();
  const choose = (field, name) => tid(field).getByRole("radio", { name, exact: true }).click();
  /** open the attributes of what is picked: the sheet on 390; the panel is already there on 820/1280 */
  const openAttrs = async () => {
    if (!wide) {
      await tid("draw-props").getByRole("button").click();
    } else h.expect((await tid("draw-props").count()) === 0, "820/1280: no «Свойства» button — the panel is on the side");
    await panel().waitFor({ timeout: 5000 });
  };
  const closeAttrs = async () => {
    if (wide) await tid("draw-panel-close").getByRole("button").click();
    // the scrim above the sheet (its middle is under the sheet)
    else await p.getByRole("button", { name: "Закрыть", exact: true }).first().click({ position: { x: 10, y: 10 } });
    await waitFor(async () => (await panel().count()) === 0, "the attributes are closed");
  };

  // the trial on, a run and a downspout on it
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  if (wide) await tid("draw-panel-empty").waitFor({ timeout: 5000 }); // nothing picked: how to pick
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  const x0 = b.x + b.width * 0.08;
  const x1 = b.x + b.width * 0.45;
  await stroke([x0, y], [x1, y]);
  await waitFor(async () => (await svg().locator("line:not([id^=halo])").count()) === 1, "one run");
  if (wide) {
    const pb = await tid("draw-panel").boundingBox();
    h.expect(pb.x >= b.x + b.width - 1, `820/1280: the panel stands right of the canvas, not over it (${pb.x} vs ${b.x + b.width})`);
  } else h.expect((await tid("draw-panel").count()) === 0, "390: no side panel");

  // the run
  await openAttrs();
  if (!wide) {
    // 390 (П20.9): storey, size, colour and the tape on top; the rest under «Ещё»
    for (const id of ["attr-story", "attr-size", "attr-color", "attr-length"]) h.expect((await tid(id).count()) === 1, `390: ${id} on top`);
    h.expect((await tid("attr-finish").count()) === 1, "390: the finish beside the colour");
    h.expect((await tid("attr-profile").count()) === 0 && (await tid("attr-hanger").count()) === 0, "390: profile and hangers under «Ещё»");
    h.expect(/профиль/.test(await tid("attr-more").innerText()), "«Ещё» says what is in it");
    await h.shot("props");
  } else h.expect((await tid("attr-profile").count()) === 1 && (await tid("attr-more").count()) === 0, "820/1280: every field of the gutter, no «Ещё»");
  await more();
  h.expect((await tid("attr-length-reset").count()) === 0, "a drawn length: no «По рисунку» (П20.16: the accuracy is the drawing's, not a line's)");
  h.expect((await chosen("attr-profile")) === "K", "K-style by default");
  const m0 = await money();
  await choose("attr-profile", "Полукруглый");
  await waitFor(async () => (await chosen("attr-profile")) === "Полукруглый", "half round picked");
  h.expect((await chosen("attr-size")) === "5″", "the size follows: 5″");
  h.expect((await chosen("attr-hanger")) === "Shank #10 (доска)", "the hanger follows the profile: shank #10 on fascia");
  await choose("attr-color", "Коричневый");
  await waitFor(async () => (await chosen("attr-color")) === "Коричневый", "brown picked");
  await h.shot("run");

  // a bad tape changes nothing
  await tid("attr-length-ft").locator("input").fill("25");
  await tid("attr-length-in").locator("input").fill("12");
  await tid("attr-length-apply").getByRole("button").click();
  await tid("attr-length-bad").waitFor({ timeout: 3000 });
  h.expect((await tid("attr-length-reset").count()) === 0, "a bad tape keeps the drawn length");
  // the tape
  await tid("attr-length-in").locator("input").fill("6");
  await tid("attr-length-apply").getByRole("button").click();
  await waitFor(async () => (await tid("attr-length-reset").count()) === 1, "taped: «По рисунку» puts the drawn one back");
  h.expect((await tid("attr-length-bad").count()) === 0, "the warning is gone");
  await waitFor(async () => (await labels()).some((t) => /^25′ 6″/.test(t)), "the label shows the taped length");
  await waitFor(async () => (await money()) !== m0, "the $ follows");
  await waitFor(async () => {
    const r = (await stored()).find((e) => e.kind === "run");
    return r && r.confidence === "taped" && r.geom.lengthIn === 306 && r.attrs.profile === "half_round" && r.attrs.color === "brown" && r.attrs.hanger === "hr_shank_fascia";
  }, "the store: the run's attributes and the tape");
  await h.shot("taped");

  // «Назад» on the canvas takes the tape back
  await closeAttrs();
  await tid("draw-undo").getByRole("button").click();
  await waitFor(async () => (await labels()).every((t) => !/^25′ 6″/.test(t)), "«Назад»: the drawn length again");
  await tid("draw-more").getByRole("button").click();
  await tid("draw-redo").getByRole("button").click();
  await waitFor(async () => (await labels()).some((t) => /^25′ 6″/.test(t)), "«Ещё» → «Вернуть»: the tape again");

  // a downspout on the run
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click(b.x + b.width * 0.25, y + 3);
  await waitFor(async () => (await svg().locator("circle").count()) === 1, "a downspout");
  await openAttrs();
  if (!wide) {
    // 390 (П20.9): size, colour, elbows on top; one «Ещё» for the rest — closed again for this new element
    for (const id of ["attr-ds-size", "attr-color", "attr-elbow-qty"]) h.expect((await tid(id).count()) === 1, `390: ${id} on top`);
    for (const id of ["attr-shape", "attr-bottom", "attr-wall", "attr-head"]) h.expect((await tid(id).count()) === 0, `390: ${id} under «Ещё»`);
    h.expect((await tid("attr-more").count()) === 1, "390: one «Ещё», closed for the new element");
  } else h.expect((await tid("attr-shape").count()) === 1, "820/1280: the shape without «Ещё»");
  await more();
  h.expect((await chosen("attr-shape")) === "Прямоугольный", "rectangular by default");
  await choose("attr-shape", "Круглый");
  await waitFor(async () => (await chosen("attr-ds-size")) === "3″", "round: the size follows (3″)");
  await choose("attr-wall", "Кирпич");
  await waitFor(async () => (await chosen("attr-wall-kit")) === "Conductor band + анкеры", "brick: its default wall kit");
  await h.shot("downspout");
  await waitFor(async () => {
    const d = (await stored()).find((e) => e.kind === "downspout");
    return d && d.attrs.shape === "round" && d.attrs.size === "3" && d.attrs.wall === "brick";
  }, "the store: the downspout's attributes");

  // a reload: all of it is back
  await p.waitForTimeout(1300); // the 1 s save after the last edit
  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await labels()).some((t) => /^25′ 6″/.test(t)), "after a reload: the taped length");
  // the reload fits the drawing anew: tap the run where it is drawn now («Желоб» tool: a tap picks)
  const at = await svg().locator("line:not([id^=halo])").first().evaluate((l) => {
    const r = l.ownerSVGElement.getBoundingClientRect();
    const n = (k) => Number(l.getAttribute(k));
    // three quarters along: the downspout sits near the start (the tape redraws the line, П20.13)
    return [r.x + (n("x1") + n("x2") * 3) / 4, r.y + (n("y1") + n("y2") * 3) / 4];
  });
  await p.mouse.click(at[0], at[1]);
  await waitFor(async () => /Желоб/.test((await tid("draw-selected").count()) ? await tid("draw-selected").innerText() : ""), "the run picked");
  await openAttrs();
  await more();
  h.expect((await tid("attr-length-reset").count()) === 1, "after a reload: still taped");
  h.expect((await chosen("attr-profile")) === "Полукруглый" && (await chosen("attr-color")) === "Коричневый", "after a reload: profile and colour");
};
