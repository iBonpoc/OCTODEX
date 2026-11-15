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
  await h.shot("header");

  await tid("draw-to-lead").getByRole("button").click();
  await tid("link-tabs").waitFor({ timeout: 5000 });
};
