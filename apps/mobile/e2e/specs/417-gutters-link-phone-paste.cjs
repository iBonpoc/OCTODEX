/**
 * e2e 417 — «Привязать замер» (LinkSheet), новая заявка: «Вставить» — значок внутри поля «Телефон», как в «Новом лиде»
 * (#1453; DS §11 п.18 — вспомогательное действие поля значком внутри поля, без кнопки с надписью). Every view.
 * - the paste icon sits inside the phone field, on its right; its touch box is 44 × 44; it has a name for the screen reader;
 * - no worded «Вставить» button in the sheet;
 * - a press pastes the number from the clipboard, formatted «(555) 555-0199»; «Создать» is then on.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const box = async (id) => (await tid(id).count() ? tid(id).first().boundingBox() : null);

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Без срока/ }).waitFor({ timeout: 5000 });

  // a draft without a client → «Привязать» → the sheet
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
  await tid("draw-to-lead").getByRole("button").click();
  await tid("link-new-phone").waitFor({ timeout: 5000 });
  await tid("link-phone-paste").waitFor({ timeout: 5000 });

  const phone = await box("link-new-phone");
  const paste = await box("link-phone-paste");
  h.expect(phone && paste, "the phone field and the paste icon are there");
  const cx = paste.x + paste.width / 2;
  const cy = paste.y + paste.height / 2;
  h.expect(cx > phone.x + phone.width / 2 && cx < phone.x + phone.width && cy > phone.y && cy < phone.y + phone.height, "the paste icon sits inside the phone field, on its right");
  h.expect(paste.width >= 44 && paste.height >= 44, `its touch box is 44 × 44 (${paste.width} × ${paste.height})`);
  h.expect(((await tid("link-phone-paste").getAttribute("aria-label")) || "").length > 0, "the icon has a name for the screen reader");
  h.expect((await p.getByText("Вставить", { exact: true }).locator("visible=true").count()) === 0, "no worded «Вставить» button");
  await h.shot("field");

  await p.evaluate(() => navigator.clipboard.writeText("+1 555.555.0199"));
  await tid("link-phone-paste").click();
  await p.waitForFunction(() => {
    const el = [...document.querySelectorAll('[data-testid="link-new-phone"] input')].find((e) => e.offsetParent !== null);
    return el?.value === "(555) 555-0199";
  }, null, { timeout: 3000 });
  await tid("link-new-save").getByRole("button").and(p.locator(":not([aria-disabled=true])")).waitFor({ timeout: 3000 });
  await h.shot("pasted");
};
