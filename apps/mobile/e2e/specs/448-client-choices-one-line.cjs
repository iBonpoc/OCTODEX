const { sheetGone, waited } = require("../sheet.cjs");
const { objMore } = require("../objectScreen.cjs");
/**
 * Spec 56 wave 4 — the client (§3а.3, §3а.5, §3а.6), every view, by testID:
 * - «Контакты клиента»: no chips and no segments left (no radio, tablist or checkbox in the sheet); the phone's label menu changes its
 *   kind; «⊕ Добавить телефон» adds a row; «⊖» removes it (its undo toast over the sheet — the separate PR); «Сделать основным» moves a number up and
 *   the saved primary is the first one;
 * - the client form: «Источник» is a SelectField row; «Счета на другой адрес» shows and hides the address fields under it;
 * - the client card (v2): «Клиент · VIP» and the status — two lines right of the name, each one line; «⋯ → Контакты» opens the sheet.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const shown = (id, timeout = 4000) => p.waitForFunction((id) => [...document.querySelectorAll(`[data-testid="${id}"]`)].some((e) => e.offsetParent !== null), id, { timeout });
  const gone = (id) => p.waitForFunction((id) => ![...document.querySelectorAll(`[data-testid="${id}"]`)].some((e) => e.offsetParent !== null), id, { timeout: 4000 });

  // the card (v2 #2350, ObjectScreen): right of the name's rule two lines — «Клиент · VIP» (what it is and the first tag, never
  // «VIP · Постоя…»; all the tags are in «⋯ → Метки») and under it the status «◷ Активный»; each line one line, never wrapped
  const lines = async () =>
    p.evaluate(() => {
      const rule = [...document.querySelectorAll('[data-testid="screen-head-rule"]')].find((e) => e.offsetParent !== null);
      const box = rule?.nextElementSibling;
      const kids = [...(box?.children ?? [])];
      return { n: kids.length, texts: kids.map((e) => e.innerText.trim()), hs: kids.map((e) => Math.round(e.getBoundingClientRect().height)) };
    });
  await h.go("/client/c1");
  await vis("client-header-status").waitFor({ timeout: 8000 });
  const one = await lines();
  h.expect(one.n === 2 && /^VIP$/.test(one.texts[0]) && /Активный/.test(one.texts[1]), `«VIP» over «Активный» (#3023: no «Клиент» — «‹ Клиенты» says it) (${JSON.stringify(one)})`);
  h.expect(one.hs.every((x) => x <= 26), `each line is one line (${one.hs})`);
  // more tags than fit: the line still says the first one only, on one line
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const extra = ["Pool", "Solar panels", "Two dogs", "Gate code", "Spanish speaking", "Weekends only"].map((name, i) => ({ id: `t-w4-${i}`, name, active: true, position: 100 + i }));
  raw.db.tags = [...raw.db.tags, ...extra];
  raw.db.customers = raw.db.customers.map((c) => (c.id === "c1" ? { ...c, tagIds: [...(c.tagIds || []), ...extra.map((x) => x.id)] } : c));
  await h.seed("octo.db.v5", raw);
  await h.go("/client/c1");
  await vis("client-header-status").waitFor({ timeout: 8000 });
  const many = await lines();
  h.expect(/^VIP$/.test(many.texts[0]) && many.hs.every((x) => x <= 26), `eight tags: still one line with the first tag (${JSON.stringify(many)})`);

  // «⋯ → Контакты» opens the sheet; the panel says «Контакты · 2» with Tom
  h.expect(/Контакты · 2[\s\S]*Tom Mitchell/.test(await p.getByTestId("client-people").first().innerText()), "the panel's «Контакты · 2»");
  await objMore(p, "client-screen", "client-act-people");
  await h.sheet().getByTestId("people-sheet").waitFor({ timeout: 5000 });
  const sheet = h.sheet();
  // no chips, no segments, no checkboxes in the sheet (DS §9 «ЗАПРЕЩЕНО»)
  const old = await sheet.locator('[role="radio"], [role="tab"], [role="tablist"], [role="checkbox"]').count();
  h.expect(old === 0, `no chips or segments in «Контакты» (${old})`);
  // the label menu changes the kind of the first number
  await sheet.getByTestId("people-0-phones-row-0-label").click();
  await p.getByTestId("people-0-phones-row-0-label-home").click();
  await p.getByRole("menu").waitFor({ state: "detached" });
  h.expect(/Домашний/.test((await sheet.getByTestId("people-0-phones-row-0-label").getAttribute("aria-label")) || ""), "the label menu set «Домашний»");
  // «⊕ Добавить телефон» adds a row
  await sheet.getByTestId("people-0-phones-add").click();
  await shown("people-0-phones-row-2");
  await sheet.getByTestId("people-0-phones-row-2-value").locator("input").fill("6265550188");
  // «⊖» removes the second number (the new one moves up to row 1)
  const second = await sheet.getByTestId("people-0-phones-row-1-value").locator("input").inputValue();
  await sheet.getByTestId("people-0-phones-row-1-remove").click();
  await gone("people-0-phones-row-2");
  h.expect((await sheet.getByTestId("people-0-phones-row-1-value").locator("input").inputValue()) !== second, "«⊖» removed the number");
  // the undo toast over the open sheet is the separate PR (DS §15.2, rule 27: checked on the iPhone with #1964)
  // «Сделать основным» on the new number: it goes up and is saved as the primary
  await sheet.getByTestId("people-0-phones-row-1-label").click();
  await p.getByTestId("people-0-phones-row-1-label-primary").click();
  await p.getByRole("menu").waitFor({ state: "detached" });
  h.expect(/555-0188/.test(await sheet.getByTestId("people-0-phones-row-0-value").locator("input").inputValue()), "«Сделать основным» moved the number up");
  h.expect(/основной/.test(await sheet.getByTestId("people-0-phones-row-0-note").innerText()), "«основной» under the first number");
  // the fields of the group start at one x (the label slot has one width), the email too
  const xs = await p.evaluate(() => ["people-0-phones-row-0-value", "people-0-phones-row-1-value", "people-0-emails-row-0-value"].map((id) => Math.round([...document.querySelectorAll(`[data-testid="${id}"]`)].find((e) => e.offsetParent !== null).getBoundingClientRect().left)));
  h.expect(new Set(xs).size === 1, `the phone and email fields start at one x (${xs})`);
  // the language and «Кто это» are rows with a menu
  h.expect((await sheet.getByTestId("people-0-lang-button").count()) === 1 && (await sheet.getByTestId("people-1-role-button").count()) === 1, "«Язык ⌄» and «Кто это ⌄» are SelectField rows");
  await sheet.getByTestId("people-save").click();
  await sheetGone(p);
  // the store is written to disk a moment after the tap: wait for the saved people, not for seconds
  h.expect(await waited(p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.customers.find((c) => c.id === "c1")?.people?.[0]?.phones?.[0]?.number === "(626) 555-0188", null, { timeout: 5000 })), "the people are saved");
  const main = (await h.db()).customers.find((c) => c.id === "c1").people[0];
  h.expect(main.phones[0].number === "(626) 555-0188" && main.phones[0].primary === true, `the first number is the primary (${JSON.stringify(main.phones)})`);
  h.expect(main.phones.filter((x) => x.primary).length === 1, "one primary");
  h.expect(main.phones.some((x) => x.label === "home"), "the label from the menu is saved");
  await h.shot("card");

  // the form: «Источник» is a SelectField row; «Счета на другой адрес» shows and hides the address
  await h.go("/client/edit?id=c2");
  await vis("client-source-button").waitFor({ timeout: 8000 });
  h.expect((await vis("client-source-button").getAttribute("aria-haspopup")) === "dialog", "«Источник ⌄» opens the sources' sheet");
  h.expect((await p.locator('[role="radio"]:visible, [role="tab"]:visible').count()) === 0, "no segments or chips in the form");
  h.expect((await p.getByTestId("client-billing-own-more").count()) === 0, "billing off: no address fields");
  await h.expectText(/Выключено — счета уходят на адрес объекта/, "billing off says where the invoices go");
  await vis("client-billing-own").click();
  await shown("client-billing-own-more");
  h.expect((await vis("client-billing-own").getAttribute("aria-checked")) === "true", "the switch is on");
  await vis("client-billing-own").click();
  await gone("client-billing-own-more");
  await vis("client-source-button").click();
  await h.sheet().getByText("Google", { exact: true }).waitFor({ timeout: 5000 });
  await h.shot("form");
};
