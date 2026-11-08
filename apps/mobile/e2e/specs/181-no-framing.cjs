/**
 * The app is never shown inside another site's frame (clickjacking; docs/specs/34 §3в, director 08.11). The site is
 * one page (web.output single) and cannot send per-page frame headers, so public/index.html hides the page unless it is
 * the top window. Here a foreign page frames the app (the client page and a screen of the app): nothing is visible
 * inside the frame, while the same address opened directly shows the app.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const origin = new URL(p.url()).origin;
  h.expect(await p.evaluate(() => getComputedStyle(document.documentElement).display) !== "none", "opened directly, the app is shown");
  for (const path of ["/today", "/p/demo0handyman0estimate0000000001", "/f/f0123456789abcdef0123456789abcdef"]) {
    await p.setContent(`<!doctype html><html><body><iframe id="x" src="${origin}${path}" width="390" height="600"></iframe></body></html>`);
    const frame = await (await p.waitForSelector("#x")).contentFrame();
    await frame.waitForLoadState("domcontentloaded");
    await p.waitForTimeout(800);
    const shown = await frame.evaluate(() => getComputedStyle(document.documentElement).display);
    h.expect(shown === "none", `${path} inside a foreign frame is hidden (display: ${shown})`);
  }
};
