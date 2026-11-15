/**
 * Required fields (DS §11 п.3–4, РС-2), every view: the main button is never off; pressing it on a wrong form puts the
 * error under every wrong required field, the first one is in view (the page is scrolled down first, so the scroll is
 * real), nothing is saved and the screen stays; a filled wrong value keeps its error until it is right.
 * Lead: phone, name (source has a default); expense: amount; supplier: name, email.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const vp = () => p.viewportSize();
  const inView = async (loc) => {
    const b = await loc.boundingBox();
    return !!b && b.y >= -1 && b.y + b.height <= vp().height + 1;
  };
  const input = (id) => vis(id).locator("input, textarea").first();

  // ---- lead: phone and name wrong, the button is at the bottom, the phone is above it
  await h.go("/lead/new");
  await vis("field-phone").waitFor({ timeout: 5000 });
  const leadsBefore = ((await h.db()).leads ?? []).length;
  const save = vis("lead-save");
  h.expect(!(await save.isDisabled()), "lead: the main button is on with an empty form");
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await vis("field-phone-error").waitFor({ timeout: 3000 });
  await vis("field-name-error").waitFor({ timeout: 3000 });
  h.expect(/10 цифр/.test(await vis("field-phone-error").innerText()), "lead: the phone error says what to enter");
  h.expect((await p.getByTestId("field-source-error").count()) === 0, "lead: the source has a default — no error");
  await p.waitForFunction(() => {
    const el = document.querySelector('[data-testid="field-phone"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  }, null, { timeout: 4000 });
  h.expect(await inView(vis("field-phone")), "lead: the first wrong field is in view");
  h.expect(/\/lead\/new/.test(p.url()), "lead: the screen stays");
  h.expect((((await h.db()).leads ?? []).length) === leadsBefore, "lead: nothing saved");
  await input("field-phone").fill("5555550100");
  await p.getByTestId("field-phone-error").waitFor({ state: "detached", timeout: 3000 });
  h.expect((await vis("field-name-error").count()) === 1, "lead: the other error stays while the name is empty");

  // ---- expense
  await h.go("/expense/new");
  await vis("field-amount").waitFor({ timeout: 5000 });
  const expBefore = ((await h.db()).expenses ?? []).length;
  const saveExp = vis("expense-save");
  h.expect(!(await saveExp.isDisabled()), "expense: the main button is on");
  await saveExp.click();
  await vis("field-amount-error").waitFor({ timeout: 3000 });
  h.expect(/\/expense\/new/.test(p.url()), "expense: the screen stays");
  h.expect((((await h.db()).expenses ?? []).length) === expBefore, "expense: nothing saved");
  await input("field-amount").fill("12.50");
  await saveExp.click();
  await p.waitForURL((u) => !/\/expense\/new/.test(u.pathname), { timeout: 5000 });
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.expenses ?? []).length === n + 1, expBefore, { timeout: 5000 });

  // ---- supplier: empty name and a wrong email
  await h.go("/suppliers/new");
  await vis("field-name").waitFor({ timeout: 5000 });
  const supBefore = ((await h.db()).suppliers ?? []).length;
  const saveSup = vis("supplier-save");
  h.expect(!(await saveSup.isDisabled()), "supplier: the main button is on");
  await input("field-email").fill("not-an-email");
  // leaving a filled wrong field shows its error at once (and moves the button down): wait for it, then press
  await input("field-email").blur();
  await vis("field-email-error").waitFor({ timeout: 3000 });
  await saveSup.click();
  await vis("field-name-error").waitFor({ timeout: 3000 });
  await vis("field-email-error").waitFor({ timeout: 3000 });
  h.expect(/\/suppliers\/new/.test(p.url()), "supplier: the screen stays");
  h.expect((((await h.db()).suppliers ?? []).length) === supBefore, "supplier: nothing saved");
  // a symbol more, still wrong: the email error stays; right: it goes
  await input("field-email").fill("not-an-email@");
  h.expect((await vis("field-email-error").count()) === 1, "supplier: still wrong — the error stays");
  await input("field-email").fill("buyer@zed.test");
  await p.getByTestId("field-email-error").waitFor({ state: "detached", timeout: 3000 });
  await input("field-name").fill("Zed Required (test)");
  await saveSup.click();
  await p.waitForURL((u) => !/\/suppliers\/new/.test(u.pathname), { timeout: 5000 });

  // ---- the showcase sample (Настройки → Дизайн-система → «Селекторы»)
  await h.go("/settings/design-system/selectors");
  await vis("showcase-required").waitFor({ timeout: 5000 });
  await vis("showcase-required-save").click();
  await vis("showcase-required-name-error").waitFor({ timeout: 3000 });
  await vis("field-kind-error").waitFor({ timeout: 3000 });
  await vis("showcase-required-name").locator("input").first().fill("Sample");
  await p.getByTestId("showcase-required-name-error").waitFor({ state: "detached", timeout: 3000 });
  h.expect((await vis("field-kind-error").count()) === 1, "showcase: the other error stays");
};
