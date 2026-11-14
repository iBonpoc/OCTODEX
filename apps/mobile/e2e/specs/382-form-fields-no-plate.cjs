/**
 * e2e 382 — a form's fields lie straight on the background, the field's helper action is an icon inside it (DS §11 п.17–18,
 * founder 14.11, #1411), «Новый лид», every view, by testID:
 * - the fields are as wide as the screen's main button (no card around them eats the width: before, they were 2 × 16 narrower);
 * - «Вставить» is no button beside the phone: an icon inside the phone field's frame, its touch box 44 high, named for the
 *   screen reader; the field is as wide as the other fields;
 * - a press pastes the number from the clipboard, formatted «(555) 555-0199».
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await p.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await h.go("/lead/new");
  await tid("new-lead-fields").waitFor({ timeout: 8000 });

  const box = (id) => tid(id).boundingBox();
  const fields = await box("new-lead-fields");
  const save = await box("lead-save");
  h.expect(fields && save, "the fields and «Сохранить лид» are there");
  h.expect(Math.abs(fields.x - save.x) <= 1 && Math.abs(fields.width - save.width) <= 1, `the fields span the column like the main button (fields ${fields.x}/${fields.width}, button ${save.x}/${save.width})`);
  // no plate under the fields: nothing between the group and the screen paints a background of its own
  const plate = await p.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid="new-lead-fields"]')].find((e) => e.offsetParent !== null);
    for (let a = el?.parentElement; a && a !== document.body; a = a.parentElement) {
      if (a.querySelector('[data-testid="lead-save"]')) return null; // reached the screen's column: no plate in between
      const bg = getComputedStyle(a).backgroundColor;
      if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return bg;
    }
    return null;
  });
  h.expect(plate === null, `no plate under the fields (found ${plate})`);

  // «Вставить»: an icon inside the phone field, a 44 touch box, a name for the screen reader, no words beside the field
  const phone = await box("field-phone");
  const name = await box("field-name");
  const paste = await box("new-lead-paste");
  h.expect(phone && name && paste, "the phone field, the name field and the paste icon are there");
  h.expect(Math.abs(phone.width - name.width) <= 1, `the phone field is as wide as the name field (${phone.width} / ${name.width})`);
  const cx = paste.x + paste.width / 2;
  const cy = paste.y + paste.height / 2;
  h.expect(cx > phone.x + phone.width / 2 && cx < phone.x + phone.width && cy > phone.y && cy < phone.y + phone.height, "the paste icon sits inside the phone field, on its right");
  h.expect(paste.width >= 44 && paste.height >= 44, `its touch box is 44 × 44 (${paste.width} × ${paste.height})`);
  h.expect(((await tid("new-lead-paste").getAttribute("aria-label")) || "").length > 0, "the icon has a name for the screen reader");
  h.expect((await p.getByText("Вставить", { exact: true }).locator("visible=true").count()) === 0, "no worded «Вставить» button");
  await h.shot("fields");

  await p.evaluate(() => navigator.clipboard.writeText("+1 555.555.0199"));
  await tid("new-lead-paste").click();
  await p.waitForFunction(() => {
    const el = [...document.querySelectorAll('[data-testid="field-phone"] input')].find((e) => e.offsetParent !== null);
    return el?.value === "(555) 555-0199";
  }, null, { timeout: 3000 });
  await h.shot("pasted");
};
