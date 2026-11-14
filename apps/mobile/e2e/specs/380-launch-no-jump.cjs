/**
 * e2e 380 — the launch without a jump (DS §18.2 «Запуск» v4.3, #1394), every view, by testID.
 * The fonts are held back so the launch is long enough to watch (a phone's cold start):
 * - the layer's mark is the splash's: 56 high, in the very middle of the screen, on the system theme's bg;
 * - a load longer than durBrandHold starts the wait — the mark stays exactly where it was (no shift up, no new size);
 * - nothing of the old launch: no intro logo, no short entry;
 * - the app comes up and the layer leaves over it (reduced motion: a fade), then nothing of it stays.
 */
exports.run = async (h, { BASE }) => {
  const p = h.page;
  await p.emulateMedia({ colorScheme: h.layout.theme === "light" ? "light" : "dark" });
  // a cold start: the fonts come late, the providers wait for them, the launch layer is on screen meanwhile
  let release;
  const held = new Promise((r) => (release = r));
  await p.route(/\.ttf(\?|$)/, async (route) => {
    await held;
    await route.continue();
  });
  await p.goto(new URL("/today", BASE).toString(), { waitUntil: "commit" });

  const still = p.getByTestId("boot-still");
  await still.waitFor({ state: "visible", timeout: 15000 });
  const vw = h.layout.width;
  const vh = p.viewportSize().height;
  const a = await still.boundingBox();
  h.expect(Math.abs(a.height - 56) <= 1, `the mark is 56 high, as on the splash (${a.height})`);
  h.expect(Math.abs(a.x + a.width / 2 - vw / 2) <= 1 && Math.abs(a.y + a.height / 2 - vh / 2) <= 1, `the mark is in the very middle (${JSON.stringify(a)})`);
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  h.expect(bg !== "rgb(255, 255, 255)", `no white page under the launch (${bg})`);
  for (const old of ["boot-intro", "boot-quick"]) h.expect((await p.getByTestId(old).count()) === 0, `${old}: not at the launch any more`);
  // no shot while the fonts are held: a screenshot waits for the fonts

  // longer than durBrandHold: the wait, the mark on the same spot
  const wait = p.getByTestId("boot-wait");
  await wait.waitFor({ state: "visible", timeout: 5000 });
  const b = await wait.boundingBox();
  h.expect(Math.abs(b.x - a.x) <= 0.5 && Math.abs(b.y - a.y) <= 0.5 && Math.abs(b.height - a.height) <= 0.5, `the wait keeps the mark where it was (${JSON.stringify(a)} → ${JSON.stringify(b)})`);

  // the fonts come: the app is up, the layer leaves and is gone
  release();
  await p.getByTestId("boot-layer").waitFor({ state: "detached", timeout: 15000 });
  await p.getByTestId("boot-leaving").waitFor({ state: "detached", timeout: 5000 });
  h.expect((await p.getByTestId("boot-brand").count()) === 0, "nothing of the launch stays under the app");
  await p.unroute(/\.ttf(\?|$)/);
  await h.shot("app");
};
