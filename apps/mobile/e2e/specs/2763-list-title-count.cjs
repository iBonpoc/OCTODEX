/**
 * e2e 2763 — a list's big title is its menu word, with NO number (DS §12.13 «Шапка», #2841; founder 26.11 «одинаковый header»).
 * Before #2841 the title carried «· N» (#2763: N had to follow the chip and the search); the number now lives only in the chip
 * («Все 7») and the group titles, so one number is never said twice. Every chip of /leads and /clients and a search that finds
 * nothing: the title stays «Лиды» / «Клиенты». By testID (rule 19): `screen-title`, `<list>-chips`, `<list>-search`, `<list>-empty`.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const title = async () => (await tid("screen-title").innerText()).trim();
  for (const [route, list, word] of [["/leads", "leads", "Лиды"], ["/clients", "clients", "Клиенты"]]) {
    await h.go(route);
    await tid(`${list}-chips`).waitFor({ timeout: 10000 });
    const chips = p.getByTestId(`${list}-chips`).locator("visible=true").first().getByRole("radio");
    const n = await chips.count();
    h.expect(n >= 2, `${list}: chips are there (${n})`);
    for (let i = 0; i < n; i++) {
      await chips.nth(i).click();
      const tt = await title();
      h.expect(tt === word, `${list} chip ${i}: the title is «${word}», no number (got «${tt}»)`);
    }
    await chips.nth(0).click();
    await tid(`${list}-search`).click();
    await tid(`${list}-search-field`).locator("input").first().fill("zzzz-2763-nothing");
    await tid(`${list}-empty`).waitFor({ timeout: 5000 });
    h.expect((await title()) === word, `${list}, nothing found: the title stays «${word}»`);
    await h.shot(`${list}-search-empty`);
  }
};
