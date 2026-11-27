/**
 * e2e 522 — the «⌄» panel of an object (estimate) over the folded header has its OWN surface (#2350 follow-up): its address, the
 * «margin» chip and the related block lie on a card, not bare over the veil and the page text under it. By testID (rule 19).
 */
exports.run = async (h) => {
  const p = h.page;
  // the folded-bar panel is the phone's (820/1280 keep the pinned address bar and the in-flow panel)
  if (h.layout.width >= 820) return;
  await h.go("/invoice");
  const db = await h.db();
  const est = db.estimates.find((e) => e.status === "sent") ?? db.estimates[0];
  await h.go(`/estimate/${est.id}`);
  await p.getByTestId("estimate-screen").locator("visible=true").first().waitFor({ timeout: 8000 });
  // fold the header: the page goes up
  await p.mouse.move(200, 500);
  await p.mouse.wheel(0, 600);
  // wait for the page to have gone up and to STAND (CHECKS §9 №3): a scroll that lands after the tap (> 8) closes the panel it opened
  await p.waitForFunction(() => {
    const y = Math.max(0, ...[...document.querySelectorAll("div")].map((d) => d.scrollTop));
    const w = window;
    const same = y > 0 && w.__y522 === y;
    w.__y522 = y;
    return same;
  }, null, { timeout: 5000, polling: 200 });
  const toggle = p.getByTestId("hdr-bar-expand").locator("visible=true").first();
  await toggle.waitFor({ timeout: 5000 });
  await toggle.dispatchEvent("click");
  await p.getByTestId("hdr-panel").locator("visible=true").first().waitFor({ timeout: 8000 });
  const panel = p.getByTestId("estimate-head-details").locator("visible=true").first();
  await panel.waitFor({ timeout: 5000 });
  const bg = await panel.evaluate((el) => getComputedStyle(el.firstElementChild).backgroundColor);
  const m = /rgba?\(([^)]+)\)/.exec(bg);
  const alpha = m ? (m[1].split(",")[3] === undefined ? 1 : parseFloat(m[1].split(",")[3])) : 0;
  h.expect(alpha >= 0.9, `the panel's own surface is opaque («${bg}»)`);
  await h.shot("panel");
  // a tap on the veil shuts it
  await p.mouse.click(200, 760);
  await panel.waitFor({ state: "hidden", timeout: 5000 });
};
