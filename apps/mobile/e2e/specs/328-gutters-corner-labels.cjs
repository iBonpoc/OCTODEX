/**
 * e2e 328 — #1275 (founder 12.11): on the canvas a corner is written as its degrees alone («90°», small, by the arc) — no «наруж.» /
 * «внутр.» / «эркер»; «· эт N» after a length only when the drawing has more than one storey. Every view. Finds things by the svg's
 * own texts; waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const texts = () => svg().locator("text").evaluateAll((ts) => ts.map((t) => (t.textContent || "").trim()).filter(Boolean));
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const waitRuns = (n) => p.waitForFunction(([k, n]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === n, [KEY, n], { timeout: 8000 });

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.45, y0 = b.y + b.height * 0.25;

  // an L on one storey: a corner with its degrees alone, lengths without the storey
  await stroke([x0, y0], [x1, y0]);
  await waitRuns(1);
  await stroke([x1, y0], [x1, y0 + 120]);
  await waitRuns(2);
  await svg().locator('[id^="c:"]').first().waitFor({ timeout: 5000 });
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="draw-svg"] text, svg text')].some((t) => /^\d+°$/.test((t.textContent || "").trim())), null, { timeout: 5000 });
  const one = await texts();
  h.expect(one.some((t) => /^\d+°$/.test(t)), `the corner is written as degrees alone (${JSON.stringify(one)})`);
  h.expect(!one.some((t) => /наруж|внутр|эркер|out|in\b|bay/i.test(t)), `no word of the corner's kind on the canvas (${JSON.stringify(one)})`);
  h.expect(!one.some((t) => /эт\s?\d/.test(t)), `one storey: the lengths carry no «эт N» (${JSON.stringify(one)})`);
  await h.shot("one-storey");

  // a second storey: now each length says its storey
  await tid("draw-story").getByRole("button").click();
  await stroke([x0, y0 + 200], [x1, y0 + 200]);
  await waitRuns(3);
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="draw-svg"] text, svg text')].some((t) => /эт\s?\d/.test(t.textContent || "")), null, { timeout: 5000 });
  const two = await texts();
  h.expect(two.some((t) => /′.*эт\s?1/.test(t)) && two.some((t) => /′.*эт\s?2/.test(t)), `two storeys: the lengths say «эт 1» and «эт 2» (${JSON.stringify(two)})`);
  await h.shot("two-storeys");
};
