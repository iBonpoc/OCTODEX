/**
 * e2e 391 — #1569 (founder 14.11, iPhone: «переключал этажи с первого на четвёртый, потом снова первый — высветило уведомление
 * „водостоков стало пять“. Я не понял, что это за уведомление и почему»). A corner of two short gutters has one automatic downspout;
 * the gutter just drawn stays picked, and the story button moves it 1 → 2 → 3 → 4 → 1 — on 2 the corner splits by story (its own
 * downspout), back on 1 it joins again (one goes). The end is what was there before: no toast «Водостоков стало N» about it.
 * Every view. Finds things by testID / stored elements; waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");
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

  // the story button four times: the picked gutter (the one just drawn) goes 1 → 2 → 3 → 4 → 1
  const story = tid("draw-story").getByRole("button");
  for (const want of [2, 3, 4, 1]) {
    await story.click();
    await waitStored(([k, s]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => !e.deletedAt && e.kind === "run" && Number(e.attrs?.story ?? 1) === s), [KEY, want], `a gutter is on story ${want}`);
  }
  // back where it started: both gutters on story 1, one chain, one downspout…
  await waitStored((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "run").every((e) => Number(e.attrs?.story ?? 1) === 1), KEY, "both gutters back on story 1");
  await dsCount(1, "back on one story: one downspout again");
  // …and no toast about a count of downspouts the person never asked about (the toast shows with the edit, in the same render)
  const toasts = await p.getByTestId("toast-text").locator("visible=true").allInnerTexts();
  h.expect(!toasts.some((x) => /Водостоков|downspouts|bajantes/i.test(x)), `no toast «Водостоков стало N» after moving a gutter between stories (${JSON.stringify(toasts)})`);
  await h.shot("story-back");
};
