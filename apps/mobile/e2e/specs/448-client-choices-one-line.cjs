/**
 * e2e 448 — the client's choices are never wrapping chips (DS §А1в, #1797, PR «клиент»), the director, every view, by testID:
 * each is a segment in one line (`radiogroup`, one row high) or a field with a menu (`<id>-button`), and it chooses:
 * - «Люди» (people sheet): who the person is, the client's language, the phone's kind;
 * - «Данные клиента»: the billing address «тот же / свой» — a segment; «свой» opens the address fields;
 * - a new property: its kind — a field with a menu (e2e 27 picks from it).
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  /** a choice in one line: a segment no taller than one row, or a field with a menu; no wrapping chips */
  const oneLine = async (id, what) => {
    const box = vis(id);
    await box.waitFor({ timeout: 8000 });
    const r = await box.evaluate((e, tid) => {
      const seg = e.querySelector('[role="radiogroup"]');
      const sel = document.querySelector(`[data-testid="${tid}-button"]`);
      const wraps = [...e.querySelectorAll("*")].some((x) => getComputedStyle(x).flexWrap === "wrap" && x.children.length > 1 && x.firstElementChild.getBoundingClientRect().top !== x.lastElementChild.getBoundingClientRect().top);
      return { seg: !!seg, segH: seg ? seg.getBoundingClientRect().height : 0, sel: !!sel, wraps };
    }, id);
    h.expect(r.seg || r.sel, `${what}: a segment or a field with a menu`);
    if (r.seg) h.expect(r.segH <= 48, `${what}: the segment is one row (${r.segH})`);
    h.expect(!r.wraps, `${what}: nothing wraps into a second line`);
    return r;
  };
  /** chooses `key` in the choice `id` — a segment's radio or the menu of a field */
  const choose = async (id, r, key, name) => {
    if (r.seg) await vis(id).getByRole("radio", { name, exact: true }).click();
    else {
      await vis(`${id}-button`).click();
      await vis(`${id}-${key}`).click();
      await p.getByRole("menu").locator("visible=true").waitFor({ state: "detached", timeout: 3000 });
    }
  };

  // «Люди»: role, language, phone kind
  await h.go("/client/c1");
  await vis("client-people").getByRole("button").first().click();
  await vis("client-people-edit").click();
  const role = await oneLine("person-1-role", "who the person is").catch(() => null);
  const lang = await oneLine("person-0-lang", "the client's language");
  await oneLine("person-0-phone-0-kind", "the phone's kind");
  await choose("person-0-lang", lang, "es", "Español");
  h.expect(role === null || role.seg || role.sel, "the role of a second person is a choice in one line");
  await h.shot("people");

  // «Данные клиента»: billing — a segment; «свой» opens the address
  await h.go("/client/edit?id=c1");
  const bill = await oneLine("client-billing", "the billing address");
  h.expect(bill.seg, "two short options — a segment");
  await choose("client-billing", bill, "own", "Другой адрес");
  await p.getByPlaceholder("Улица и дом").locator("visible=true").first().waitFor({ timeout: 4000 });
  await h.shot("billing");
};
