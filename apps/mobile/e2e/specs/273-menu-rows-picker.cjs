/**
 * Long lists in a form row (#1164, DS А2 / А3), every view:
 * - a menu shows at most 6.5 rows (the last one half) and scrolls;
 * - it opens at the chosen item (the tenth of twelve is on the screen, not scrolled out);
 * - more than twelve items are not a menu but a sheet with search: search narrows, «Ничего не нашлось», a pick fills the field.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system/selectors");
  await vis("showcase-selectors").waitFor({ timeout: 5000 });

  // twelve, nothing chosen: 6.5 rows high, scrolls
  await vis("showcase-select-long").scrollIntoViewIfNeeded();
  await vis("showcase-select-long").getByRole("button").first().click();
  const menu = p.getByTestId("menu-items").locator("visible=true").last();
  await menu.waitFor({ timeout: 3000 });
  const box = await menu.boundingBox();
  h.expect(Math.abs(box.height - 6.5 * 44) <= 2, `the menu shows 6.5 rows (${box.height} of ${6.5 * 44})`);
  const scrolls = await menu.evaluate((el) => [...el.querySelectorAll("*"), el].some((e) => e.scrollHeight > e.clientHeight + 1 && getComputedStyle(e).overflowY !== "visible"));
  h.expect(scrolls, "…and it scrolls");
  await pressEscUntilClosed(p, p.getByRole("menu").locator("visible=true").last());

  // the tenth is chosen: the menu opens at it
  await vis("showcase-select-tenth").scrollIntoViewIfNeeded();
  await vis("showcase-select-tenth").getByRole("button").first().click();
  const m2 = p.getByTestId("menu-items").locator("visible=true").last();
  await m2.waitFor({ timeout: 3000 });
  // the menu opens at the chosen item: within a moment (the rows are placed first) the tenth is in the window
  const inWindow = () => p.evaluate(() => {
    const win = [...document.querySelectorAll('[data-testid="menu-items"]')].pop().getBoundingClientRect();
    const it = [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.getAttribute("aria-label") === "a10" || e.textContent.trim() === "a10").getBoundingClientRect();
    return { ok: it.top >= win.top - 1 && it.bottom <= win.bottom + 1, it: [Math.round(it.top), Math.round(it.bottom)], win: [Math.round(win.top), Math.round(win.bottom)] };
  });
  await p.waitForFunction(() => {
    const win = [...document.querySelectorAll('[data-testid="menu-items"]')].pop().getBoundingClientRect();
    const it = [...document.querySelectorAll('[role="menuitem"]')].find((e) => e.getAttribute("aria-label") === "a10" || e.textContent.trim() === "a10").getBoundingClientRect();
    return it.top >= win.top - 1 && it.bottom <= win.bottom + 1;
  }, null, { timeout: 3000 });
  const w = await inWindow();
  h.expect(w.ok, `the chosen item is inside the menu window (${w.it} in ${w.win})`);
  await pressEscUntilClosed(p, p.getByRole("menu").locator("visible=true").last());

  // twenty: a sheet with search
  await vis("showcase-select-search").scrollIntoViewIfNeeded();
  await vis("showcase-select-search").getByRole("button").first().click();
  await vis("showcase-select-search-picker").waitFor({ timeout: 3000 });
  h.expect((await p.getByRole("menu").locator("visible=true").count()) === 0, "more than twelve: no menu");
  const search = vis("showcase-select-search-picker-search").locator("input");
  await search.fill("n1");
  await p.getByTestId("showcase-select-search-picker-n20").waitFor({ state: "detached", timeout: 3000 });
  h.expect((await p.getByTestId("showcase-select-search-picker-n10").count()) === 1, "search «n1» keeps n10…");
  h.expect((await p.getByTestId("showcase-select-search-picker-n2").count()) === 0, "…and drops n2");
  await search.fill("zzz");
  await vis("showcase-select-search-picker-empty").waitFor({ timeout: 3000 });
  await search.fill("n17");
  await vis("showcase-select-search-picker-n17").getByRole("button").first().click();
  await p.waitForFunction(() => /n17/.test(document.querySelector('[data-testid="showcase-select-search"]')?.textContent ?? ""), null, { timeout: 3000 });
  // after a pick the focus is back on the field (web)
  await p.waitForFunction(() => document.activeElement?.closest('[data-testid="showcase-select-search-button"]') !== null && document.activeElement?.closest('[data-testid="showcase-select-search-button"]') !== undefined, null, { timeout: 3000 });

  // reopened: the chosen row is read out as selected, shows no «›»; Esc clears the search first, then closes; focus returns
  await vis("showcase-select-search").getByRole("button").first().click();
  await vis("showcase-select-search-picker").waitFor({ timeout: 3000 });
  const row = vis("showcase-select-search-picker-n17").getByRole("button").first();
  const rowHtml = await vis("showcase-select-search-picker-n17").evaluate((e) => e.innerHTML.slice(0, 400));
  h.expect((await row.getAttribute("aria-selected")) === "true", `the chosen row is selected for a screen reader (${rowHtml})`);
  h.expect((await p.getByTestId("showcase-select-search-picker-n3").getByRole("button").first().getAttribute("aria-selected")) !== "true", "…and the others are not");
  await vis("showcase-select-search-picker-search").locator("input").fill("n1");
  await p.evaluate(() => {
    window.__esc = [];
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") window.__esc.push(document.querySelector('[data-testid="showcase-select-search-picker-search"] input')?.value ?? "gone"); }, true);
  });
  await pressEscUntilClosed(p, p.getByTestId("showcase-select-search-picker").locator("visible=true").first());
  const esc = await p.evaluate(() => window.__esc);
  h.expect(esc.length >= 2 && esc[0] === "n1" && esc[1] === "", `Esc: the first press clears the search, the second closes (${esc.join("|")})`);
  await p.waitForFunction(() => !!document.activeElement?.closest('[data-testid="showcase-select-search-button"]'), null, { timeout: 3000 });
};
