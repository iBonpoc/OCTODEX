/**
 * e2e 257 — the canvas follows the company's length format (#1092 PR-2, founder 12.11). Every view.
 * «Настройки» → «Миллиметры»; a gutter drawn: the length window types in mm from the start and says what was drawn in mm;
 * after «Применить» the label on the canvas is in mm and the picked gutter's panel says its length in mm; there is no unit
 * choice per line any more.
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction(() => /^Пробный/.test((document.querySelector('[data-testid="module-gutters-status"]')?.textContent ?? "").trim()), null, { timeout: 8000 });
  await h.go("/module/gutters/settings");
  await tid("gset-len-format").waitFor({ timeout: 8000 });
  await tid("gset-len-format-button").click();
  await tid("gset-len-format-mm").click();
  await p.waitForFunction((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.settings?.lenFormat === "mm", KEY, { timeout: 8000 });

  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  const a = [b.x + b.width * 0.2, y], c = [b.x + b.width * 0.6, y];
  await p.mouse.move(a[0], a[1]);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((c[0] - a[0]) * i) / 12, y);
  await p.mouse.up();

  // the length window: typed in mm from the start, the drawn length in mm
  await tid("quick-length-one").waitFor({ timeout: 5000 });
  h.expect((await tid("quick-length-ft").count()) === 0, "mm typed from the start, no feet fields");
  const sheet = await tid("quick-length").innerText();
  h.expect(/\d+ mm/.test(sheet) && !/\d′/.test(sheet), "the window says the drawn length in mm: " + sheet.replace(/\n/g, " | ").slice(0, 120));
  // #1181 review Б1: the field and the tape start from the drawn length in mm — not from the inches (60 in → «60», «60 mm»)
  const drawnMm = sheet.match(/(\d+) mm/)[1];
  const typed = await tid("quick-length-one").locator("input").inputValue();
  h.expect(typed === drawnMm, `the field holds the drawn length in mm (${typed} vs ${drawnMm})`);
  const tapeSays = await tid("quick-length-tape-value").innerText();
  h.expect(tapeSays.includes(drawnMm), `the tape's big value is the drawn length in mm (${tapeSays} vs ${drawnMm})`);
  await skipLength(p);

  // the label on the canvas
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="draw-svg"] text')].some((t) => /\d+ mm · эт 1$/.test(t.textContent || "")), null, { timeout: 8000 });
  h.expect(!(await p.getByTestId("draw-svg").first().locator("text").evaluateAll((ts) => ts.some((t) => /\d′/.test(t.textContent || "")))), "no feet on the canvas");

  // the picked gutter's panel
  await p.mouse.click((a[0] + c[0]) / 2, y);
  if (!wide) await tid("draw-props").getByRole("button").click();
  await tid("attr-panel").waitFor({ timeout: 5000 });
  h.expect(/\d+ mm/.test(await tid("attr-panel").innerText()), "the panel says the length in mm");
  h.expect((await tid("attr-unit").count()) === 0, "no unit choice per line");
  await h.shot("canvas-mm");
};
