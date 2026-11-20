/**
 * e2e 412 — кнопка имени в шапке холста помещается целиком (#1665; DS §19а: до привязки — «Привязать»). Every view.
 * - a saved draft without a lead or an address: the name button says «Привязать», the word whole — not cut with «…»
 *   (it was «+ Сделать заявк…» at 390, both themes);
 * - it opens «Привязать замер» (the LinkSheet).
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });

  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4;
  await p.mouse.move(b.x + b.width * 0.2, y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(b.x + b.width * (0.2 + (0.4 * i) / 8), y);
  await p.mouse.up();
  await skipLength(p);
  await tid("draw-to-lead").waitFor({ timeout: 6000 });

  // the word, whole: its text box is as wide as the text (a cut one is narrower than its scroll width)
  const fit = await tid("draw-to-lead").first().evaluate((root) => {
    const el = [...root.querySelectorAll("*")].find((e) => e.childElementCount === 0 && (e.textContent || "").trim().length > 0);
    return el ? { text: el.textContent.trim(), cut: el.scrollWidth > el.clientWidth + 1 } : null;
  });
  h.expect(!!fit, "the name button has its word");
  h.expect(fit.text === "Привязать", `the name button says «Привязать» (${fit.text})`);
  h.expect(!fit.cut, `the word is whole, not cut with «…» (${fit.text})`);
  // #1752 (founder 16.11: «фотоаппарат не в единой системе», «Готово другого размера»): the header's buttons are one height (DS §19а: 36),
  // the camera a plate as «⋯», not a bare icon
  const plate = (id) => p.getByTestId(id).locator("visible=true").first().evaluate((root) => {
    const el = [root, ...root.querySelectorAll("*")].find((e) => { const cs = getComputedStyle(e); return cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent" && parseFloat(cs.borderTopLeftRadius) >= 8; });
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  });
  await tid("draw-done").waitFor({ timeout: 6000 });
  const heights = { who: await plate("draw-who"), done: await plate("draw-done"), ...((await tid("draw-photos-open").count()) ? { photos: await plate("draw-photos-open") } : {}) };
  h.expect(Object.values(heights).every((x) => x === 36), `the header's buttons are 36 high, each on its plate (${JSON.stringify(heights)})`);
  if (h.layout.width <= 390) h.expect("photos" in heights, "the phone has the camera in the header");
  await h.shot("header");

  await tid("draw-to-lead").getByRole("button").click();
  await tid("link-tabs").waitFor({ timeout: 5000 });
};
