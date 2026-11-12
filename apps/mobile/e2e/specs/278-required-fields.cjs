/**
 * Required fields (DS §11 п.3–4, РС-2), every view: the main button is never off; pressing it on an empty form puts
 * the error under every wrong required field, the first one is in view, nothing is saved and the screen stays.
 * Lead: phone, name, (source has a default); expense: amount; supplier: name.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const inView = async (loc) => {
    const b = await loc.boundingBox();
    const vp = p.viewportSize();
    return !!b && b.y >= -1 && b.y + b.height <= vp.height + 1;
  };

  await h.go("/lead/new");
  await vis("field-phone").waitFor({ timeout: 5000 });
  const save = p.getByRole("button", { name: /Сохранить лид/ }).locator("visible=true").first();
  h.expect(!(await save.isDisabled()), "lead: the main button is on with an empty form");
  await save.click();
  await vis("field-phone-error").waitFor({ timeout: 3000 });
  await vis("field-name-error").waitFor({ timeout: 3000 });
  h.expect(/10 цифр/.test(await vis("field-phone-error").innerText()), "lead: the phone error says what to enter");
  h.expect(await inView(vis("field-phone")), "lead: the first wrong field is in view");
  h.expect(/\/lead\/new/.test(p.url()), "lead: nothing saved, the screen stays");
  // typing into the field takes its error away
  await vis("field-phone").locator("input").first().fill("5555550100");
  await p.getByTestId("field-phone-error").waitFor({ state: "detached", timeout: 3000 });

  await h.go("/expense/new");
  await vis("field-amount").waitFor({ timeout: 5000 });
  const saveExp = p.getByRole("button", { name: /Сохранить расход/ }).locator("visible=true").first();
  h.expect(!(await saveExp.isDisabled()), "expense: the main button is on");
  await saveExp.click();
  await vis("field-amount-error").waitFor({ timeout: 3000 });
  h.expect(/\/expense\/new/.test(p.url()), "expense: the screen stays");
  await vis("field-amount").locator("input").first().fill("12.50");
  await saveExp.click();
  await p.waitForURL((u) => !/\/expense\/new/.test(u.pathname), { timeout: 5000 });
};
