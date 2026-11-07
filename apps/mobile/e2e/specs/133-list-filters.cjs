const { listSearch } = require("../listSearch.cjs");
/**
 * Filters over the lists — one rule (docs/specs/31-list-filters.md, variant Б, step 10в), every view (3 widths × 2 themes).
 * Each PR of 10в adds its list to LISTS. For every list:
 * - over the list at most two rows (the search with «Фильтр», one lane); at 390 the first card starts in the top 40 %;
 * - the lane is one line, no chip «· 0» but the chosen one; no status colour on the chips;
 * - «Фильтр» → the sheet → an option on → the line «… ✕» under the lane → the list narrows → ✕ takes it off;
 * - the status and the options are kept for this list on this device; the search is not.
 */
const LISTS = [
  // PR 1: «Клиенты» — the tags in the sheet
  { path: "/clients", search: "Имя, телефон или адрес", group: "Метки" },
  // PR 2: «Лиды» — no Leads · Estimates · Invoices switch; people («Мои») and sources in the sheet
  { path: "/leads", search: "Имя, телефон, адрес, услуга", group: "Ответственный", noSwitch: true },
  // PR 3: «Сметы» and «Счета» — sections of their own with a search; nothing in the sheet yet (no «Фильтр» button)
  { path: "/estimates", search: "Клиент, адрес, работа, EST" },
  { path: "/invoice", search: "Клиент, адрес, работа, INV" },
  // PR 5: «Задачи» («Только мои» in the sheet), «Каталог» (kinds, no sheet)
  { path: "/tasks", search: "Искать задачу", group: "Чьи", card: '[data-testid^="task-"]' },
  { path: "/catalog", search: "Поиск в каталоге" },
  // «Оплаты» (one rule, founder 07.11): the periods are the lane, the method in the sheet — both in the address (?p=, ?m=)
  { path: "/payments?p=all", search: "Клиент, RCT, INV", group: "Способ оплаты", inAddress: true },
];

exports.run = async (h) => {
  const p = h.page;
  const vis = (loc) => loc.locator("visible=true");
  for (const L of LISTS) {
    await h.go(L.path);
    const bar = vis(p.getByTestId("filter-bar")).first();
    await bar.waitFor();
    // a first-visit hint of the screen is not part of the filters: close it before measuring
    const got = vis(p.getByRole("button", { name: "Понятно", exact: true }));
    if (await got.count()) { await got.first().click(); await p.waitForTimeout(300); }
    if (L.noSwitch) h.expect((await vis(p.getByRole("tab", { name: /^(Сметы|Счета)$/ })).count()) === 0, `${L.path}: no switch of sub-lists over the list (spec 31 §7а)`);

    // rows over the list: the search row and the lane — the lane is one line
    const chips = vis(bar.getByRole("radio"));
    const tops = await chips.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    h.expect(tops.length >= 1 && tops.every((y) => Math.abs(y - tops[0]) <= 1), `${L.path}: the lane is one line (${tops.join(", ")})`);
    // the search is an icon (founder 07.11): folded, it shares one row with the lane on every width
    const toggle = vis(bar.getByTestId("filter-search-toggle")).first();
    const tb = await toggle.boundingBox();
    const lane = await vis(bar.getByTestId("filter-lane")).first().boundingBox();
    const mid = (b) => b.y + b.height / 2;
    h.expect(tb && tb.height <= 36 && Math.abs(mid(tb) - mid(lane)) <= 8, `${L.path}: the search icon and the lane in one row (${JSON.stringify(tb)} / ${JSON.stringify(lane)})`);
    const first = await vis(p.locator(L.card ?? '[data-testid="list-card"]')).first().boundingBox();
    if (h.layout.width === 390) h.expect(first && first.y < 844 * 0.4, `${L.path}: 390 — the first card in the top 40 % (${first && first.y})`);

    // no empty chip but the chosen one
    const texts = await chips.allInnerTexts();
    const checked = await vis(bar.locator('[role="radio"][aria-checked="true"]')).allInnerTexts();
    h.expect(texts.filter((x) => /· 0$/.test(x) && !checked.includes(x)).length === 0, `${L.path}: no «· 0» chips (${texts.join(" | ")})`);

    // the search icon: a tap opens the field with the focus; 390 — the lane goes to row 2, 820/1280 — stays in the row;
    // a blur with text folds it into a marked icon (the list stays searched); a tap reopens it with the text; ✕ folds it
    const cardSel = L.card ?? '[data-testid="list-card"]';
    const whole = await vis(p.locator(cardSel)).count();
    await toggle.click();
    const field = vis(bar.getByTestId("filter-search-field")).first();
    await field.waitFor();
    await p.waitForTimeout(400);
    h.expect(await field.evaluate((el) => document.activeElement === el), `${L.path}: the open field has the focus`);
    const fb = await field.boundingBox();
    const lane2 = await vis(bar.getByTestId("filter-lane")).first().boundingBox();
    if (h.layout.width === 390) h.expect(lane2.y > fb.y + fb.height - 1, `${L.path}: 390 — the lane goes under the open field`);
    else h.expect(Math.abs(mid(lane2) - mid(fb)) <= 12, `${L.path}: ${h.layout.width} — the lane stays in the row of the open field`);
    await field.fill("zzzqqq"); await p.waitForTimeout(300);
    h.expect((await vis(p.locator(cardSel)).count()) === 0, `${L.path}: the search narrows the list`);
    await field.evaluate((el) => el.blur()); await p.waitForTimeout(400);
    h.expect((await vis(bar.getByTestId("filter-search-field")).count()) === 0, `${L.path}: a blur folds the field`);
    h.expect((await toggle.getAttribute("aria-label")) === "Поиск: zzzqqq", `${L.path}: the folded icon says the search is on`);
    h.expect((await vis(p.locator(cardSel)).count()) === 0, `${L.path}: the list stays searched`);
    await h.shot(`${L.path.slice(1)}-search-on`);
    await toggle.click(); await field.waitFor();
    h.expect((await field.inputValue()) === "zzzqqq", `${L.path}: reopened with the same text`);
    await vis(bar.getByTestId("filter-search-clear")).first().click(); await p.waitForTimeout(400);
    h.expect((await vis(bar.getByTestId("filter-search-field")).count()) === 0 && (await toggle.getAttribute("aria-label")) === "Поиск", `${L.path}: ✕ empties and folds it`);
    h.expect((await vis(p.locator(cardSel)).count()) === whole, `${L.path}: the list is whole again`);

    // a list without a sheet: no «Фильтр» button; the chip is kept between visits, the search is not
    if (!L.group) {
      h.expect((await vis(bar.getByTestId("filter-button")).count()) === 0 && (await vis(bar.getByTestId(/^filter-group-/)).count()) === 0, `${L.path}: no «Фильтр» without groups`);
      const other = vis(bar.locator('[role="radio"][aria-checked="false"]')).first();
      const label = await other.getAttribute("aria-label");
      await other.click(); await p.waitForTimeout(300);
      await listSearch(p, "zzz");
      await h.go(L.path);
      h.expect((await vis(p.getByTestId("filter-bar")).first().locator(`[role="radio"][aria-checked="true"][aria-label="${label}"]`).count()) === 1, `${L.path}: the chip «${label}» is kept`);
      h.expect((await vis(p.getByTestId("filter-search-toggle")).first().getAttribute("aria-label")) === "Поиск", `${L.path}: the search is not kept`);
      await h.shot(`${L.path.slice(1)}-kept`);
      continue;
    }

    // the sheet: an option on → the chosen line → the list narrows → ✕
    const before = await vis(p.locator(L.card ?? '[data-testid="list-card"]')).count();
    const open = h.layout.width === 1280 ? vis(bar.getByTestId(/^filter-group-/)).first() : vis(bar.getByTestId("filter-button")).first();
    await open.click(); await p.waitForTimeout(400);
    const rows = h.sheet().getByRole("checkbox");
    h.expect((await rows.count()) > 0, `${L.path}: options as rows in the sheet`);
    // an option with something behind it (its count > 0)
    const labels = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
    const i = labels.findIndex((x) => /· [1-9]\d*$/.test(x));
    h.expect(i >= 0, `${L.path}: an option with objects (${labels.join(" | ")})`);
    const name = labels[i].replace(/ · \d+$/, "");
    const n = Number(labels[i].match(/· (\d+)$/)[1]);
    await rows.nth(i).click();
    await h.sheet().getByText("Готово", { exact: true }).click(); await p.waitForTimeout(400);
    const chosen = vis(p.getByTestId("filter-chosen")).first();
    h.expect((await chosen.getByRole("button", { name: `Убрать фильтр: ${name}` }).count()) === 1, `${L.path}: the chosen line «${name} ✕»`);
    h.expect((await vis(p.getByRole("button", { name: "Фильтры, включено: 1" })).count()) >= 1, `${L.path}: the button says how many are on`);
    const after = await vis(p.locator(L.card ?? '[data-testid="list-card"]')).count();
    h.expect(after <= before && after <= n, `${L.path}: the list narrows (${before} → ${after}, option ${n})`);
    await h.shot(`${L.path.slice(1)}-chosen`);

    // kept between visits (or, for a list that keeps it in the address, on a reload of that address); the search is not
    await listSearch(p, "zzz");
    if (L.inAddress) { await p.reload(); await p.waitForTimeout(1000); } else await h.go(L.path);
    h.expect((await vis(p.getByTestId("filter-chosen")).first().getByRole("button", { name: `Убрать фильтр: ${name}` }).count()) === 1, `${L.path}: the option is kept`);
    h.expect((await vis(p.getByTestId("filter-search-toggle")).first().getAttribute("aria-label")) === "Поиск", `${L.path}: the search is not kept`);

    // ✕ takes it off
    await vis(p.getByTestId("filter-chosen")).first().getByRole("button", { name: `Убрать фильтр: ${name}` }).click(); await p.waitForTimeout(300);
    h.expect((await vis(p.getByTestId("filter-chosen")).count()) === 0, `${L.path}: ✕ — the line is gone`);
    h.expect((await vis(p.locator(L.card ?? '[data-testid="list-card"]')).count()) === before, `${L.path}: the list is whole again`);
  }
};
