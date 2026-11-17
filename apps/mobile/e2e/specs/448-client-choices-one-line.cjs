const { sheetGone, waited } = require("../sheet.cjs");
/**
 * Spec 56 wave 4 — the client (§3а.3, §3а.5, §3а.6), every view, by testID:
 * - «Контакты клиента»: no chips and no segments left (no radio, tablist or checkbox in the sheet); the phone's label menu changes its
 *   kind; «⊕ Добавить телефон» adds a row; «⊖» removes it (its undo toast over the sheet — the separate PR); «Сделать основным» moves a number up and
 *   the saved primary is the first one;
 * - the client form: «Источник» is a SelectField row; «Счета на другой адрес» shows and hides the address fields under it;
 * - the client card: number, status and tags on one line (one top, no wrap); «Контакты · N» opens the sheet.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const shown = (id, timeout = 4000) => p.waitForFunction((id) => [...document.querySelectorAll(`[data-testid="${id}"]`)].some((e) => e.offsetParent !== null), id, { timeout });
  const gone = (id) => p.waitForFunction((id) => ![...document.querySelectorAll(`[data-testid="${id}"]`)].some((e) => e.offsetParent !== null), id, { timeout: 4000 });

  // the card: one line «CLT-0001 · ✓ Клиент · VIP · Постоянный», never wrapped
  await h.go("/client/c1");
  await vis("client-headline").waitFor({ timeout: 8000 });
  const tops = await p.evaluate(() => {
    const line = [...document.querySelectorAll('[data-testid="client-headline"]')].find((e) => e.offsetParent !== null);
    const r = (e) => e.getBoundingClientRect();
    const box = r(line);
    const parts = [line.querySelector('[data-testid="client-status"]'), line.querySelector('[data-testid="client-headline-tags"]')].filter(Boolean);
    return { lineH: box.height, parts: parts.map((e) => Math.round(r(e).top + r(e).height / 2)), lineMid: Math.round(box.top + box.height / 2) };
  });
  h.expect(tops.parts.length === 2, `status and tags are in the line (${tops.parts.length})`);
  h.expect(tops.parts.every((y) => Math.abs(y - tops.lineMid) <= 2), `status and tags on one line, same middle (${JSON.stringify(tops)})`);
  h.expect(tops.lineH <= 48, `the line does not wrap (${tops.lineH})`);
  // more tags than fit: the line stays one, «+N» takes the rest
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const extra = ["Pool", "Solar panels", "Two dogs", "Gate code", "Spanish speaking", "Weekends only"].map((name, i) => ({ id: `t-w4-${i}`, name, active: true, position: 100 + i }));
  raw.db.tags = [...raw.db.tags, ...extra];
  raw.db.customers = raw.db.customers.map((c) => (c.id === "c1" ? { ...c, tagIds: [...(c.tagIds || []), ...extra.map((x) => x.id)] } : c));
  await h.seed("octo.db.v5", raw);
  await h.go("/client/c1");
  await vis("client-headline").waitFor({ timeout: 8000 });
  await shown("client-headline-more");
  const many = await p.evaluate(() => {
    const line = [...document.querySelectorAll('[data-testid="client-headline"]')].find((e) => e.offsetParent !== null);
    const more = line.querySelector('[data-testid="client-headline-more"]');
    const lb = line.getBoundingClientRect();
    const mb = more.getBoundingClientRect();
    return { lineH: lb.height, moreRight: mb.right, lineRight: lb.right, text: more.innerText };
  });
  h.expect(many.lineH <= 48, `eight tags: still one line (${many.lineH})`);
  h.expect(/^\+\d+$/.test(many.text.trim()) && many.moreRight <= many.lineRight + 1, `«+N» inside the line (${JSON.stringify(many)})`);

  // «Контакты · 2 ›» opens the sheet
  h.expect(/Контакты[\s\S]*Tom Mitchell[\s\S]*\b2\b/.test(await vis("client-people").innerText()), "the row «Контакты · 2»");
  await vis("client-people").getByRole("button").first().click();
  await h.sheet().getByTestId("people-sheet").waitFor({ timeout: 5000 });
  const sheet = h.sheet();
  // no chips, no segments, no checkboxes in the sheet (DS §9 «ЗАПРЕЩЕНО»)
  const old = await sheet.locator('[role="radio"], [role="tab"], [role="tablist"], [role="checkbox"]').count();
  h.expect(old === 0, `no chips or segments in «Контакты» (${old})`);
  // the label menu changes the kind of the first number
  await sheet.getByTestId("people-0-phones-row-0-label").click();
  await p.getByTestId("people-0-phones-row-0-label-home").click();
  await p.getByRole("menu").waitFor({ state: "detached" });
  h.expect(/Домашний/.test(await sheet.getByTestId("people-0-phones-row-0-label").innerText()), "the label menu set «Домашний»");
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
