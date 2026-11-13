/**
 * e2e 144 — «Замер», холст модуля Gutters (docs/specs/33-gutters-canvas.md П20.4 M4b; спека 33 §7). Every view.
 * - «Компания → Модули» → «Холст замера»: the module is off — the canvas says at once that nothing will be saved;
 *   the empty canvas asks to draw the first run; no total under the drawing (#700: it is on «Просмотр замера»);
 * - one finger draws a run → a line with «… · эт 1»; a second run from
 *   its end sticks to it (a corner); the downspout tool puts one on a run; the storey button turns the picked run
 *   to storey 2 (label and colour); «Удалить» → «Отменить» brings it back; «Назад»/«Вернуть»;
 * - П20.8: every toolbar cell has its word under it, none cut off (Желоб, Водосток, Свойства on the phone — «Выбрать» is gone, #687 — Эт 1 / Этаж, Назад, Вперёд);
 *   a picked tool says what to do («Нажмите на желоб, где водосток») until it is used; a downspout is «D1» on the canvas;
 *   «Удалить» stands by what is picked; «Вернуть» and the toolbar's place are in «Ещё»;
 * - П20.9: after the first gutter «Дальше: поставьте водостоки» + «Водосток» turns the tool on;
 * - the toolbar goes bottom → under the right hand → under the left → bottom (from «Ещё»);
 * - off: nothing is stored; on (the 7-day trial): the drawing goes to the store (module.op, spec 33 П21 M5a) in the
 *   database's shape (П19: run {a, b}, downspout {runId, atIn}, whole inches) and comes back after a reload.
 * Finds things by testID; waits on what it checks.
 */
// the demo company's data on the phone: the module's slice DB.moduleData.gutters (spec 33 П21)
const { skipLength, closeDsMenu, savedOnce } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  // a picked run has a halo line under it (id halo-…): count the runs, not the halo
  const count = (sel) => svg().locator(sel === "line" ? "line:not([id^=halo])" : sel).count();
  const labels = () => svg().locator("text").evaluateAll((ts) => ts.map((t) => t.textContent || ""));
  const waitFor = async (ok, what, tries = 30) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const box = async () => p.getByTestId("draw-surface").boundingBox();
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
    await p.waitForTimeout(200);
  };
  /** the one measurement in the store and its elements, or null */
  const stored = () =>
    p.evaluate((k) => {
      const g = (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters;
      const m = g && g.measurements[0];
      return m ? { m, elements: g.elements.filter((e) => e.measurementId === m.id) } : null;
    }, KEY);

  await h.go("/company/modules");
  await tid("module-gutters-draw").scrollIntoViewIfNeeded();
  await tid("module-gutters-draw").getByRole("button").click();
  await p.waitForURL(/\/module\/gutters\/draw$/, { timeout: 5000 });
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await tid("draw-not-saved").waitFor({ timeout: 5000 });
  h.expect(/Модуль не подключён — рисунок не сохранится/.test(await tid("draw-not-saved").innerText()), "off: says nothing will be saved");
  await tid("draw-empty").waitFor({ timeout: 3000 });
  h.expect((await tid("draw-money").count()) === 0 && (await tid("draw-total").count()) === 0, "no total under the drawing (#700)");
  h.expect((await tid("tab-bar").count()) === 0, "no bottom bar over the canvas");
  await h.shot("empty");
  // #1274 (founder 12.11): the toolbar has pictures only — the words are the cells' names (screen reader), not drawn under them
  const bar = await tid("draw-toolbar").innerText();
  const phone = (h.layout?.width ?? 390) < 600;
  h.expect(!/Желоб|Водосток|Назад|Вперёд|Этаж|Свойства/.test(bar), `no words on the toolbar (${bar.replace(/\n/g, " | ")})`);
  for (const [id, w] of [["draw-tool-line", "Желоб"], ["draw-tool-ds", "Водосток"], ...(phone ? [["draw-props", "Свойства"]] : []), ["draw-story", "Этаж"], ["draw-undo", "Назад"], ["draw-redo", "Вперёд"]]) {
    const name = (await tid(id).getByRole("button").getAttribute("aria-label")) || "";
    h.expect(name.includes(w), `${id} is named «${w}» (${name})`);
  }
  h.expect(!bar.includes("Выбрать"), "no «Выбрать» (#687): a tap picks with any tool");
  const cut = await p.getByTestId("draw-toolbar").locator("visible=true").first().evaluate((el) => [...el.querySelectorAll("div")].filter((d) => d.childElementCount === 0 && d.textContent && d.scrollWidth > d.clientWidth + 1).map((d) => d.textContent));
  h.expect(cut.length === 0, `no word is cut off (${cut.join(", ")})`);
  // the bin is on the toolbar always (#1274), dimmed and not pressable while nothing is picked
  h.expect((await tid("draw-delete").count()) === 1 && (await tid("draw-delete").getAttribute("aria-disabled")) === "true", "the bin: nothing picked — it is there, disabled");

  // a run along the roof edge
  const b = await box();
  const y = b.y + b.height * 0.42;
  const x0 = b.x + b.width * 0.25;
  const x1 = b.x + b.width * 0.7;
  await stroke([x0, y], [x1, y]);
  await waitFor(async () => (await count("line")) === 1, "one run drawn");
  await waitFor(async () => (await labels()).some((t) => / · эт 1$/.test(t)), "its label: length · эт 1");
  h.expect(/Желоб · .* · эт 1/.test(await tid("draw-selected").innerText()), "the new run is picked");
  h.expect((await tid("draw-empty").count()) === 0, "the empty hint is gone");

  // a second run from near its end: sticks to it → a corner, more $
  await stroke([x1 + 6, y + 4], [x1 + 6, y + b.height * 0.2]);
  await waitFor(async () => (await count("line")) === 2, "second run");
  const xy = await svg().locator("line:not([id^=halo])").evaluateAll((ls) => ls.map((l) => ["x1", "y1", "x2", "y2"].map((k) => Number(l.getAttribute(k)))));
  h.expect(Math.hypot(xy[1][0] - xy[0][2], xy[1][1] - xy[0][3]) < 1, `the second run starts at the first one's end — a corner (${JSON.stringify(xy)})`);

  // a downspout on the first run — the next step is offered under the $ (П20.9)
  h.expect((await tid("draw-next").count()) === 0, "off: no «what next» — no estimate comes of it");
  await tid("draw-tool-ds").getByRole("button").click();
  await tid("draw-hint").waitFor({ timeout: 3000 });
  h.expect(/Нажмите на желоб, где водосток/.test(await tid("draw-hint").innerText()), "the downspout tool says where to tap");
  await h.shot("hint");
  await p.mouse.click((x0 + x1) / 2, y + 3);
  await closeDsMenu(p);
  await waitFor(async () => (await count("circle")) === 1, "a downspout on the run");
  await waitFor(async () => (await tid("draw-hint").count()) === 0, "the hint is gone once the downspout is there");
  h.expect((await tid("draw-next").count()) === 0, "a downspout is there: the next step is the estimate, no line");
  h.expect((await labels()).includes("D1"), "the downspout is «D1» on the canvas");
  await h.shot("drawn");

  // pick the first run, storey 2
  // a tap with «Желоб» picks (#687: no «Выбрать»)
  await tid("draw-tool-line").getByRole("button").click();
  await p.mouse.click(x0 + (x1 - x0) * 0.2, y);
  await waitFor(async () => /Желоб/.test(await tid("draw-selected").innerText().catch(() => "")), "picked the run");
  const before = new Set(await svg().locator("line:not([id^=halo])").evaluateAll((ls) => ls.map((l) => l.getAttribute("stroke"))));
  await tid("draw-story").click();
  await waitFor(async () => (await labels()).some((t) => / · эт 2$/.test(t)), "storey 2 on its label");
  const after = new Set(await svg().locator("line:not([id^=halo])").evaluateAll((ls) => ls.map((l) => l.getAttribute("stroke"))));
  h.expect(after.size === 2 && before.size === 1, `storey 2 has its own colour (${[...before]} → ${[...after]})`);

  // delete → «Отменить»
  await tid("draw-delete").getByRole("button").click();
  await waitFor(async () => (await count("line")) === 1 && (await count("circle")) === 0, "the run and its downspout are gone");
  // the toast ignores a tap in its first moment (src/ui/toastArm.ts: the second tap of a double tap is not «Отменить»)
  await p.waitForTimeout(600);
  await p.getByRole("button", { name: /Отменить/ }).locator("visible=true").last().click();
  await waitFor(async () => (await count("line")) >= 2 && (await count("circle")) === 1, "«Отменить» brings them back");
  // the canvas's own «назад» / «вперёд»
  await tid("draw-undo").getByRole("button").click();
  await waitFor(async () => (await count("circle")) === 0 && (await count("line")) === 1, "«Назад» = the delete again");
  await tid("draw-redo").getByRole("button").click();
  await waitFor(async () => (await count("circle")) === 1, "«Вперёд» beside «Назад» (founder 09.11)");

  // «Выбрать» is gone (#687): an end is no longer moved by a quick drag (handles on the picked gutter's ends — #682);
  // a drag on from a free end grows the gutter — e2e 212

  // the toolbar: bottom → right hand → left hand → bottom
  const tx = async () => { const r = await tid("draw-toolbar").boundingBox(); return { cx: r.x + r.width / 2, w: r.width, h: r.height }; };
  // the middle of the canvas (on 820/1280 the attribute panel stands right of it — spec 33 П21.8)
  const cb = await p.getByTestId("draw-surface").boundingBox();
  const vw = 2 * cb.x + cb.width;
  const t0 = await tx();
  h.expect(t0.w > t0.h, "bottom: a row");
  // by its grip («Ещё» is gone, founder 09.11): dragged to an edge it sticks there
  const placeTo = async (k) => {
    const g = await tid("draw-grip").boundingBox();
    const vp = p.viewportSize();
    const to = { right: [vp.width - 6, vp.height / 2], left: [6, vp.height / 2], bottom: [vp.width / 2, vp.height - 6] }[k];
    const a = [g.x + g.width / 2, g.y + g.height / 2];
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 15; i++) await p.mouse.move(a[0] + ((to[0] - a[0]) * i) / 15, a[1] + ((to[1] - a[1]) * i) / 15);
    await p.mouse.up();
    await p.waitForTimeout(300);
  };
  await placeTo("right");
  await waitFor(async () => { const t = await tx(); return t.h > t.w && t.cx > vw / 2; }, "under the right hand: a column on the right");
  await h.shot("right");
  await placeTo("left");
  await waitFor(async () => { const t = await tx(); return t.h > t.w && t.cx < vw / 2; }, "under the left hand: a column on the left");
  await placeTo("bottom");
  await waitFor(async () => { const t = await tx(); return t.w > t.h; }, "back to the bottom");

  await p.waitForTimeout(1500);
  h.expect((await stored()) === null, "off: nothing stored");

  // on: the 7-day trial → the drawing is kept on the phone in the database's shape and comes back
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await tid("module-gutters-draw").getByRole("button").click();
  await p.waitForURL(/\/module\/gutters\/draw$/, { timeout: 5000 });
  await tid("draw-surface").waitFor({ timeout: 8000 });
  h.expect((await tid("draw-not-saved").count()) === 0, "on: no warning");
  // the canvas opens the saved measurement by its id after the first save (spec 33 П21): the reload below comes back to it
  const b2 = await box();
  const yy = b2.y + b2.height * 0.42;
  await stroke([b2.x + b2.width * 0.25, yy], [b2.x + b2.width * 0.7, yy]);
  // on: the next step is offered under the $ (П20.9) and turns the downspout tool on
  // the chip says what is picked while the new gutter is; the hint «Дальше: водостоки» is for nothing picked (#1274): a tap on the empty canvas
  await p.mouse.click(b2.x + b2.width * 0.5, b2.y + b2.height * 0.65);
  await tid("draw-next").waitFor({ timeout: 3000 });
  h.expect(/Дальше: водостоки/.test(await tid("draw-next").innerText()), "what next: the downspouts (in the summary chip)");
  await h.shot("next");
  await tid("draw-next").click(); // the hint is the chip: a tap puts the downspout tool on
  await tid("draw-hint").waitFor({ timeout: 3000 });
  h.expect((await tid("draw-next").count()) === 0, "the downspout tool is on: no «what next» line");
  await p.mouse.click(b2.x + b2.width * 0.47, yy + 3);
  await waitFor(async () => (await count("circle")) === 1, "a downspout");
  await savedOnce(p); // saved into the phone (no cloud mark any more, #1274)
  await waitFor(async () => ((await stored())?.elements.length ?? 0) === 2, "the store has both (written to the phone)");
  const s = await stored();
  h.expect(!!s && s.m.status === "draft" && s.elements.length === 2, `stored: one run and one downspout (${JSON.stringify(s && s.elements.map((e) => e.kind))})`);
  const run = s.elements.find((e) => e.kind === "run");
  const ds = s.elements.find((e) => e.kind === "downspout");
  h.expect(run.geom.a.concat(run.geom.b).every(Number.isInteger) && run.confidence === "drawn" && run.attrs.story === 1, `run row: whole inches (${JSON.stringify(run)})`);
  h.expect(ds.geom.runId === run.id && Number.isInteger(ds.geom.atIn), `downspout row: on its run (${JSON.stringify(ds.geom)})`);
  await h.shot("saved");
  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await count("line")) === 1 && (await count("circle")) === 1, "after a reload the drawing is back");
};
