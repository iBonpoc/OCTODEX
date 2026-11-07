/**
 * The spec helper `h` (go, text, expect, expectText, click, sheet, shot, db, sign) — for e2e/run.cjs and
 * e2e/cloud/cloud.cjs (docs/specs/21). helpers(page, BASE, OUT, name): screenshots go to OUT/<name>-<n>.png.
 */
const path = require("node:path");

function helpers(page, BASE, OUT, name) {
  const h = {
    page,
    go: async (p) => { await page.goto(BASE + p); await page.waitForTimeout(1000); },
    text: async () => (await page.locator("body").innerText()).split("\n").join(" | "),
    expect: (cond, msg) => { if (!cond) throw new Error(`expect failed: ${msg}`); },
    // Polls up to 3 s: a sheet or toast may still be opening after a fixed wait (02 failed once at 1280 dark on CI, 05.11).
    expectText: async (re, msg) => {
      let t = await h.text();
      for (let i = 0; i < 15 && !re.test(t); i++) { await page.waitForTimeout(200); t = await h.text(); }
      if (!re.test(t)) throw new Error(`expected ${re} (${msg || ""})\n${t.slice(0, 400)}`);
      return t.match(re);
    },
    click: async (name, opts = {}) => { await page.getByRole("button", { name, exact: true, ...opts }).last().click(); await page.waitForTimeout(350); },
    clickText: async (txt) => { await page.getByText(txt, { exact: true }).last().click(); await page.waitForTimeout(350); },
    sheet: () => page.locator('[aria-modal="true"]').last(),
    shot: (n) => page.screenshot({ path: path.join(OUT, `${name}-${n}.png`) }),
    db: () => page.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db),
    sign: async (signer) => {
      await page.getByPlaceholder(/Ваше имя|Your name/).last().fill(signer);
      await page.getByRole("switch", { name: /E-SIGN/ }).last().click();
      const pad = page.getByLabel(/расписывается|signs here/i).last();
      await pad.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
      const bb = await pad.boundingBox();
      await page.mouse.move(bb.x + 30, bb.y + 90); await page.mouse.down();
      for (let i = 0; i < 20; i++) await page.mouse.move(bb.x + 30 + i * 12, bb.y + 90 - Math.sin(i / 2) * 40);
      await page.mouse.up();
      await page.getByRole("button", { name: /Одобрить и подписать|Approve and sign/ }).last().click();
      await page.waitForTimeout(800);
    },
  };
  return h;
}

module.exports = { helpers };
