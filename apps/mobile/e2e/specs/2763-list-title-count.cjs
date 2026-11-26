/**
 * e2e 2763 — the number in a list's title is what is SHOWN (DS §12 «Список (ListScreen)», #2763): the chip and the search, not all
 * of the kind. Before: «Лиды · 5» over «Здесь лидов нет» (chip «Архив»), «Клиенты · 7» over «Ничего не найдено» (a search).
 * Every chip of /leads and /clients: «Title · N» — N is the rows on the screen; a search that finds nothing — «· 0».
 * By testID (rule 19): the title `screen-title`, the rows `lead-row-<id>` / `client-row-<id>`, the chips `<list>-chips`.
 */
const { waited } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  // the number after «·» in the title
  const titleN = async () => {
    const m = /·\s*(\d+)\s*$/.exec((await tid("screen-title").innerText()).trim());
    return m ? Number(m[1]) : null;
  };
  // the rows on the screen: `<prefix><id>` with no further «-part» (the row's own buttons are `<prefix>sms-<id>`…)
  const rows = (prefix) =>
    p.evaluate((pre) => [...document.querySelectorAll(`[data-testid^="${pre}"]`)].filter((e) => /^[^-]+$/.test(e.getAttribute("data-testid").slice(pre.length)) && e.getClientRects().length > 0).length, prefix);
  // the title follows the rows (both are one render): wait for the two to agree, then check — never for seconds
  const agree = async (prefix, what) => {
    // the check below reads the result: a timeout here only means the two did not agree — the expect says so
    await waited(p.waitForFunction(
      (pre) => {
        const t = [...document.querySelectorAll('[data-testid="screen-title"]')].find((e) => e.getClientRects().length > 0);
        const m = t && /·\s*(\d+)\s*$/.exec(t.innerText.trim());
        const n = [...document.querySelectorAll(`[data-testid^="${pre}"]`)].filter((e) => /^[^-]+$/.test(e.getAttribute("data-testid").slice(pre.length)) && e.getClientRects().length > 0).length;
        return !!m && Number(m[1]) === n;
      },
      prefix,
      { timeout: 5000 },
    ));
    const n = await titleN();
    const r = await rows(prefix);
    h.expect(n === r, `${what}: the title says ${n}, the screen shows ${r} rows`);
  };

  for (const [route, list, prefix] of [["/leads", "leads", "lead-row-"], ["/clients", "clients", "client-row-"]]) {
    await h.go(route);
    await tid(`${list}-chips`).waitFor({ timeout: 10000 });
    const chips = p.getByTestId(`${list}-chips`).locator("visible=true").first().getByRole("radio");
    const n = await chips.count();
    h.expect(n >= 2, `${list}: chips are there (${n})`);
    for (let i = 0; i < n; i++) {
      const chip = chips.nth(i);
      const name = (await chip.innerText()).trim();
      await chip.click();
      const sel = `[data-testid="${list}-chips"]`;
      h.expect(await waited(p.waitForFunction(([s, k]) => [...document.querySelectorAll(`${s} [role="radio"]`)].filter((e) => e.getClientRects().length > 0)[k]?.getAttribute("aria-checked") === "true", [sel, i], { timeout: 3000 })), `${list}: the chip «${name}» is chosen`);
      await agree(prefix, `${list} «${name}»`);
    }
    // back to the first chip, then a search that finds nothing: «Ничего не найдено» under «· 0»
    await chips.nth(0).click();
    await tid(`${list}-search`).click();
    await tid(`${list}-search-field`).locator("input").first().fill("zzzz-2763-nothing");
    await tid(`${list}-empty`).waitFor({ timeout: 5000 });
    await agree(prefix, `${list}, a search with nothing found`);
    h.expect((await titleN()) === 0, `${list}: nothing found — the title says 0 (${await titleN()})`);
    await h.shot(`${list}-search-empty`);
  }
};
