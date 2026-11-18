/**
 * e2e 462 — spec 56 wave 4б (#1869), every view, by testID:
 * - the request page /f/: no chips — «Language ⌄» and «Type of work ⌄» are SelectField rows (§3 row 4); the language from the menu
 *   changes the page; the SMS consent is a ToggleRow (§3 row 1): a switch with the consent text as its label, off by default, the
 *   whole row presses;
 * - «Настройки приложения» → «Местоположение»: one ToggleRow «Делиться во время выезда» (§3 row 2), not two chips; off by the row,
 *   the toast offers «Отменить».
 * Both ask for nothing old: no radio, tab or checkbox in these places.
 */
const TOKEN = "f0123456789abcdef0123456789abcdef";

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();

  // — «Местоположение» in the app's settings (the company allows it, the tech shares)
  await h.go("/clients");
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db, null, { timeout: 8000 }); // the demo is there
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw.db.location = { allowed: true, on: true };
  raw.db.visitPoints = [];
  await h.seed("octo.db.v5", raw);
  await h.go("/settings");
  await vis("loc7b-switch").waitFor({ timeout: 8000 });
  const card = vis("loc7b-switch");
  const radios = await p.locator('[role="radio"]').locator("visible=true").filter({ hasText: /делиться/i }).count();
  h.expect(radios === 0, `«Местоположение»: no chips (${radios})`);
  const loc = p.getByRole("switch", { name: "Делиться во время выезда" }).locator("visible=true").first();
  h.expect((await loc.getAttribute("aria-checked")) === "true", "on: the switch is on");
  await card.click();
  await h.expectText(/Геопозиция выключена, точки удалены/, "off by the row: the toast with «Отменить» (rule 5)");
  await p.waitForFunction(() => [...document.querySelectorAll('[role="switch"]')].every((e) => e.offsetParent === null || !/Делиться во время выезда/.test(e.getAttribute("aria-label") || "") || e.getAttribute("aria-checked") !== "true"), null, { timeout: 4000 });
  h.expect(true, "the switch is off");
  await h.shot("settings");

  // — /f/ (the edge function is put in by the browser: GET → the company's form)
  await p.route("**/functions/v1/lead-intake*", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, form: { company: "Sunset Gutters", language: "en", captcha: false, sms_consent: true, categories: [
        { id: "0b000000-0000-4000-8000-000000000001", key: "gutters" }, { id: "0b000000-0000-4000-8000-000000000002", name: "Window cleaning" }] } }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await h.go(`/f/${TOKEN}`);
  await vis("intake-fields").waitFor({ timeout: 8000 });
  const old = await p.locator('[role="radio"], [role="tab"], [role="tablist"], [role="checkbox"]').locator("visible=true").count();
  h.expect(old === 0, `/f/: no chips, segments or checkboxes (${old})`);
  h.expect(/Language/.test(await vis("intake-lang-button").innerText()) && /English/.test(await vis("intake-lang-button").innerText()), "«Language · English ⌄» is a row");
  h.expect(/Type of work/.test(await vis("intake-category-button").innerText()), "«Type of work ⌄» is a row");
  // the consent: a switch, off, named by its full text; a tap on the text (the row) turns it on
  const sw = p.getByRole("switch", { name: /I agree to receive text messages from Sunset Gutters/ }).locator("visible=true").first();
  h.expect((await sw.getAttribute("aria-checked")) !== "true", "the SMS consent is off by default");
  await vis("intake-consent").getByText(/I agree to receive/).click();
  await p.waitForFunction(() => [...document.querySelectorAll('[role="switch"]')].some((e) => e.offsetParent !== null && e.getAttribute("aria-checked") === "true"), null, { timeout: 4000 });
  h.expect(true, "a tap on the consent's text turns its switch on");
  // the language from the menu: the page follows
  await vis("intake-lang-button").click();
  await vis("intake-lang-es").click();
  await h.expectText(/Cuéntele a Sunset Gutters lo que necesita/, "«Idioma ⌄» → Español: the page in Spanish");
  h.expect(/Idioma/.test(await vis("intake-lang-button").innerText()) && /Español/.test(await vis("intake-lang-button").innerText()), "the row shows «Idioma · Español»");
  // the homeowner's page, not the app: its words follow the client's language (the app's is Russian), and it has no app menu
  h.expect((await p.getByText(/^(Язык|Вид работ|Лиды|Клиенты)$/).locator("visible=true").count()) === 0, "no words of the app's language and no app menu on /f/");
  await h.shot("f");
};
