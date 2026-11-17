/**
 * e2e 391 — #1608 (founder 15.11, README §12 п.19: «Эт» только переключает этаж рисования, нарисованное не трогает), before it #1569
 * (founder 14.11: «переключал этажи 1 → 4 → 1 — высветило „водостоков стало пять“, не понял почему»). A corner of two short gutters
 * has one automatic downspout; the gutter just drawn stays picked, and the story button goes 1 → 2 → 3 → 4 → 1: the picked gutter stays
 * on story 1, nothing is redrawn, no downspout comes or goes, no toast. The properties' «Этаж» row moves it (and «Назад» back);
 * a gutter drawn after that, with the button on 2, is on story 2.
 * Every view. Finds things by testID / stored elements; waits on what it checks (no pauses).
 */
const { chooseAttr, openProps, saveAttrs, sheetGone, skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.autoDs = true; // about the automatic downspouts (the runner switches them off for the others)

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const els = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt), KEY);
  const waitStored = (fn, arg, what) => p.waitForFunction(fn, arg, { timeout: 8000 }).catch(async () => h.expect(false, `${what}: ${JSON.stringify((await els()).map((e) => ({ kind: e.kind, story: e.attrs?.story, geom: e.geom })))}`));
  const dsCount = (n, what) => waitStored(([k, want]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "downspout").length === want, [KEY, n], what);
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();

  // a corner of two short gutters (well under 40 ft together): one chain, one automatic downspout
  const y = b.y + b.height * 0.3;
  await stroke([b.x + b.width * 0.15, y], [b.x + b.width * 0.45, y]);
  await dsCount(1, "a new gutter has its downspout");
  const caps = await svg().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const right = caps.sort((u, v) => v[0] - u[0])[0];
  await stroke(right, [right[0], right[1] + 100]);
  await waitStored((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "run").length === 2, KEY, "two gutters");
  await dsCount(1, "a corner of two gutters has ONE downspout");

  // the story button four times with the gutter just drawn picked: the button says the story, the gutters stay on story 1
  h.expect((await tid("draw-selected").count()) === 1, "the gutter just drawn is picked");
  const story = tid("draw-story").getByRole("button");
  const runs = () => els().then((xs) => xs.filter((e) => e.kind === "run"));
  for (const want of [2, 3, 4, 1]) {
    await story.click();
    await p.waitForFunction((n) => [...document.querySelectorAll('[data-testid="draw-story"]')].some((e) => e.offsetParent && (e.textContent || "").includes(String(n))), want, { timeout: 5000 });
    h.expect(!/эт/.test(await tid("draw-selected").innerText()), `«Эт» → ${want}: the picked gutter stays on one storey — no «эт N» in the summary (#1666)`);
    const xs = await runs();
    h.expect(xs.length === 2 && xs.every((e) => Number(e.attrs?.story ?? 1) === 1), `«Эт» → ${want}: the gutters stay on story 1 (${JSON.stringify(xs.map((e) => e.attrs?.story ?? 1))})`);
    h.expect((await els()).filter((e) => e.kind === "downspout").length === 1, `«Эт» → ${want}: still one downspout`);
  }
  // nothing was edited: no toast about a count of downspouts, and «Назад» has nothing of the story button's to take back
  const toasts = await p.getByTestId("toast-text").locator("visible=true").allInnerTexts();
  h.expect(!toasts.some((x) => /Downspout стало|downspouts|bajantes/i.test(x)), `no toast «Downspout стало N» after the story button (${JSON.stringify(toasts)})`);
  await h.shot("story-back");

  // a gutter goes to another story by its properties (the «Этаж» row): the picked one → 2, the button follows; «Назад» takes it back
  await openProps(p);
  await chooseAttr(p, "attr-story", "2"); // a menu row of the window (v6); written on «Сохранить» (#1858)
  await saveAttrs(p);
  await waitStored((k) => { const r = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "run"); return r.filter((e) => Number(e.attrs?.story ?? 1) === 2).length === 1 && r.filter((e) => Number(e.attrs?.story ?? 1) === 1).length === 1; }, KEY, "the properties moved the picked gutter to story 2");
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="draw-story"]')].some((e) => e.offsetParent && (e.textContent || "").includes("2")), null, { timeout: 5000 });
  await sheetGone(p); // the phone's sheet closed on «Сохранить»
  await tid("draw-undo").getByRole("button").click();
  await waitStored((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "run").every((e) => Number(e.attrs?.story ?? 1) === 1), KEY, "«Назад»: both gutters back on story 1");
  await dsCount(1, "back on one story: one downspout");

  // the button stays on 2 — it is for what comes next: a new gutter well apart is on story 2, the two first ones stay on 1
  h.expect(/2/.test(await tid("draw-story").innerText()), "the story button says 2");
  const y2 = b.y + b.height * 0.75;
  await stroke([b.x + b.width * 0.15, y2], [b.x + b.width * 0.45, y2]);
  await waitStored((k) => { const r = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "run"); return r.length === 3 && r.filter((e) => Number(e.attrs?.story ?? 1) === 2).length === 1 && r.filter((e) => Number(e.attrs?.story ?? 1) === 1).length === 2; }, KEY, "the new gutter on story 2, the first two on story 1");
  await h.shot("new-on-2");
};
