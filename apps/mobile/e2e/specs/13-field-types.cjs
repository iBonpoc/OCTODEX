/** Text fields carry their type: keyboard (inputmode), autofill (autocomplete), US formatting while typing. */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/client/edit");
  const attrs = async (ph) => p.getByPlaceholder(ph, { exact: true }).last().evaluate((el) => ({ mode: el.getAttribute("inputmode"), ac: el.getAttribute("autocomplete"), cap: el.getAttribute("autocapitalize") }));
  const phone = await attrs("(555) 555-0100");
  h.expect(phone.mode === "tel" && phone.ac === "tel", `phone field: ${JSON.stringify(phone)}`);
  const email = await attrs("client@example.com");
  h.expect(email.mode === "email" && email.ac === "email" && email.cap === "none", `email field: ${JSON.stringify(email)}`);
  const name = await attrs("Имя");
  h.expect(name.ac === "name" && name.cap === "words", `name field: ${JSON.stringify(name)}`);
  const street = await attrs("Улица, дом, офис");
  h.expect(street.ac === "address-line1", `street field: ${JSON.stringify(street)}`);

  // phone is formatted while typing, extra digits dropped
  const ph = p.getByPlaceholder("(555) 555-0100").last();
  await ph.pressSequentially("62655501990000");
  h.expect((await ph.inputValue()) === "(626) 555-0199", `formatted: ${await ph.inputValue()}`);

  // company: ZIP and EIN keep only digits in the US shape
  await h.go("/company/profile");
  const ein = p.getByPlaceholder("12-3456789").last();
  if (await ein.count()) {
    await ein.fill("");
    await ein.pressSequentially("123456789");
    h.expect((await ein.inputValue()) === "12-3456789", `EIN: ${await ein.inputValue()}`);
    h.expect((await ein.getAttribute("inputmode")) === "numeric", "EIN numeric keyboard");
  }
  await h.go("/company/address");
  const zip = p.getByPlaceholder("ZIP").first();
  if (await zip.count()) {
    await zip.fill("");
    await zip.pressSequentially("91103a1234");
    h.expect((await zip.inputValue()) === "91103-1234", `ZIP: ${await zip.inputValue()}`);
  }
  // money / numbers: decimal keyboard in the estimate builder
  await h.go("/estimate/new");
  const modes = await p.locator("input").evaluateAll((els) => els.map((e) => e.getAttribute("inputmode")));
  h.expect(modes.every((m) => m), "every input has an inputmode");
};
