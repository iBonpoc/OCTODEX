const { listSearch } = require("../listSearch.cjs");
/**
 * Filters over the lists — one rule (docs/specs/31-list-filters.md, variant Б, step 10в), every view (3 widths × 2 themes).
 * Each PR of 10в adds its list to LISTS. Prototype v2 (#2350): the lists on the List template (src/ui/templates/ListScreen —
 * «Клиенты», «Лиды», «Сметы», «Счета», «Задачи», «Оплаты») have no FilterBar: the search is the header's icon `<screen>-search`
 * (the field `<screen>-search-field`, the focus in it), the sections are one segment `<screen>-chips`; they are checked in TEMPLATE —
 * the search narrows the rows to none (`<screen>-empty`), the field emptied gives every row back, the search is not kept. For every
 * FilterBar list (LISTS):
 * - over the list at most two rows (the search with «Фильтр», one lane); at 390 the first card starts in the top 40 %;
 * - the lane is one line, no chip «· 0» but the chosen one; no status colour on the chips;
 * - «Фильтр» → the sheet → an option on → the line «… ✕» under the lane → the list narrows → ✕ takes it off;
 * - the status and the options are kept for this list on this device; the search is not.
 */
const LISTS = [
  // PR 5: «Каталог» (kinds, no sheet)
  { path: "/catalog", search: "Поиск в каталоге" },
  // PR 4: «Работы» — «Мастер» (people of the nearest open visit, «Не назначен») and «Направление» in the sheet
  { path: "/jobs", search: "Клиент, адрес, работа, JOB", group: "Мастер" },
  // «Звонки» (one rule, director 07.11): the outcomes are the lane, no sheet; three calls of our own (the demo has one, no outcome)
  {
    path: "/calls",
    search: "Кто, заметка",
    card: '[data-testid^="comms-"]',
    setup: () => {
      const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
      const at = (m) => new Date(Date.now() - m * 60_000).toISOString();
      const call = (id, outcome, m) => ({ id, subjectType: "lead", subjectId: "l2", kind: "call", at: at(m), actorId: raw.db.me, meta: { outcome, duration_min: 2 }, body: `T133 ${id}` });
      raw.db.activities = [...raw.db.activities.filter((x) => !String(x.id).startsWith("c133-")), call("c133-1", "answered", 30), call("c133-2", "answered", 40), call("c133-3", "no_answer", 50)];
      localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    },
  },
];

// v2 List template: the screen's testID and what a row's testID is (a row's own buttons — «позвонить», «готово» — are not rows)
const TEMPLATE = [
  { path: "/clients", id: "clients", row: "^client-row-(?!call-)" },
  { path: "/leads", id: "leads", row: "^lead-row-(?!tel-|sms-)" },
  { path: "/estimates", id: "est-list", row: "^est-row-", tiles: true },
  { path: "/invoice?f=all", id: "invoice-list", row: "^invoice-row-", tiles: true },
  { path: "/tasks", id: "tasks", row: "^task-(?!done-)" },
  { path: "/payments", id: "payments-list", row: "^payment-row-", tiles: true },
];

exports.run = async (h) => {
  const p = h.page;
  const vis = (loc) => loc.locator("visible=true");
  for (const L of LISTS) {
    if (L.setup) { await h.go("/today"); await p.evaluate(L.setup); }
    await h.go(L.path);
    const bar = vis(p.getByTestId("filter-bar")).first();
    await bar.waitFor();
    // a first-visit hint of the screen is not part of the filters: close it before measuring
    const got = vis(p.getByRole("button", { name: "Понятно", exact: true }));
    // optional: the first-visit hint of the screen shows once per device — close it only when it is there (#800)
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
    h.expect(tb && tb.height <= (h.layout.width < 820 ? 40 : 36) && /* rule 3 (21.11, #2350): visible 40 on a phone */  Math.abs(mid(tb) - mid(lane)) <= 8, `${L.path}: the search icon and the lane in one row (${JSON.stringify(tb)} / ${JSON.stringify(lane)})`);
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
    const rows = h.sheet().getByRole(L.single ? "radio" : "checkbox");
    h.expect((await rows.count()) > 0, `${L.path}: options as rows in the sheet`);
    // an option with something behind it (its count > 0)
    const labels = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
    const i = labels.findIndex((x) => /· [1-9]\d*$/.test(x));
    h.expect(i >= 0, `${L.path}: an option with objects (${labels.join(" | ")})`);
    // a one-at-a-time group says its title on the chip: «Клиент: David Kim»
    const name = (L.single ? `${L.group}: ` : "") + labels[i].replace(/ · \d+$/, "");
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
  for (const T of TEMPLATE) {
    await h.go(T.path);
    const groups = vis(p.getByTestId(`${T.id}-groups`)).first();
    await groups.waitFor({ timeout: 8000 });
    const rows = () => p.evaluate((re) => [...document.querySelectorAll("[data-testid]")].filter((e) => e.offsetParent !== null && new RegExp(re).test(e.getAttribute("data-testid")) && !/-swipe$/.test(e.getAttribute("data-testid"))).length, T.row);
    const whole = await rows();
    h.expect(whole > 0, `${T.path}: rows (${whole})`);
    // the sections: one segment, one line
    // optional: «Задачи» has no sections (no segment) — the other lists do
    const seg = vis(p.getByTestId(`${T.id}-chips`));
    if (await seg.count()) {
      const tops = await seg.first().getByRole("radio").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      h.expect(tops.every((y) => Math.abs(y - tops[0]) <= 1), `${T.path}: the sections are one line (${tops.join(", ")})`);
    }
    // «Деньги»: the money tiles 2×2 stand over the rows by design (BUILD-SPEC §2.9) — the rows start right under them
    if (T.tiles) {
      const tiles = await vis(p.getByTestId("money-tiles")).first().boundingBox();
      const first = await groups.boundingBox();
      h.expect(tiles && first && first.y >= tiles.y + tiles.height && first.y - (tiles.y + tiles.height) <= 48, `${T.path}: the rows right under the money tiles (${tiles && tiles.y + tiles.height} → ${first && first.y})`);
    } else if (h.layout.width === 390) {
      const first = await groups.boundingBox();
      h.expect(first && first.y < 844 * 0.4, `${T.path}: 390 — the first row in the top 40 % (${first && first.y})`);
    }
    // the search: the header's icon opens the field with the focus; nothing found — the empty state; emptied — every row
    await vis(p.getByTestId(`${T.id}-search`)).first().click();
    const field = vis(p.getByTestId(`${T.id}-search-field`)).first();
    await field.waitFor({ timeout: 3000 });
    const input = (await field.evaluate((e) => e.tagName)) === "INPUT" ? field : field.locator("input").first();
    await p.waitForFunction((tid) => {
      const a = document.activeElement;
      return !!a && !!a.closest(`[data-testid="${tid}"]`) || a?.getAttribute("data-testid") === tid;
    }, `${T.id}-search-field`, { timeout: 3000 });
    await input.fill("zzzqqq");
    await vis(p.getByTestId(`${T.id}-empty`)).first().waitFor({ timeout: 3000 });
    h.expect((await rows()) === 0, `${T.path}: the search narrows the list to none`);
    await h.shot(`${T.id}-search-on`);
    await input.fill("");
    await groups.waitFor({ timeout: 3000 });
    h.expect((await rows()) === whole, `${T.path}: the field emptied — the list is whole again`);
    // the search is not kept between visits
    await input.fill("zzzqqq");
    await vis(p.getByTestId(`${T.id}-empty`)).first().waitFor({ timeout: 3000 });
    await h.go(T.path);
    await vis(p.getByTestId(`${T.id}-groups`)).first().waitFor({ timeout: 8000 });
    h.expect((await rows()) === whole && (await vis(p.getByTestId(`${T.id}-search-field`)).count()) === 0, `${T.path}: the search is not kept`);
  }
};
