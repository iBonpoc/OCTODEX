const { listSearch, listSearchClear } = require("../listSearch.cjs");
/**
 * «Расходы», «Счета» и отчёты по одному правилу фильтров (docs/specs/31-list-filters.md, director 07.11), every view:
 * - «Расходы»: a magnifier (vendor, category, work, client, who paid); nothing found — «В этом отборе никого нет»; ✕ — all;
 * - «Счета»: «Клиент» in the «Фильтры» sheet, one at a time; picked — a chip «Клиент: X ✕» under the row; ✕ — every client;
 *   no «Все клиенты» button;
 * - a report: the periods are a lane (no magnifier), in one row with «CSV» (a phone: «CSV» under it); a tap changes the period.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (loc) => loc.locator("visible=true");
  const card = '[data-testid="list-card"]';
  const db = await (async () => { await h.go("/today"); return h.db(); })();

  // «Расходы»
  await h.go("/money");
  const bar = vis(p.getByTestId("filter-bar")).first();
  await bar.waitFor();
  const all = await vis(p.locator(card)).count();
  h.expect(all === db.expenses.length && all > 1, `every expense is a card (${all})`);
  const vendor = db.expenses[0].vendor;
  await listSearch(p, vendor);
  const n = await vis(p.locator(card)).count();
  h.expect(n >= 1 && n === db.expenses.filter((x) => x.vendor.toLowerCase().includes(vendor.toLowerCase())).length, `the vendor «${vendor}» (${n})`);
  await listSearch(p, "zzzqqq");
  h.expect((await vis(p.locator(card)).count()) === 0, "nothing found — no cards");
  await h.expectText(/В этом отборе никого нет/, "… and it says so");
  await h.shot("expenses-search");
  await listSearchClear(p);
  h.expect((await vis(p.locator(card)).count()) === all, "✕ — every expense again");

  // «Счета»: the client in the sheet → the chip
  await h.go("/invoice?f=all");
  const ibar = vis(p.getByTestId("filter-bar")).first();
  await ibar.waitFor();
  const got = vis(p.getByRole("button", { name: "Понятно", exact: true }));
  // optional: the first-visit hint of the screen shows once per device — close it only when it is there (#800)
  if (await got.count()) { await got.first().click(); await p.waitForTimeout(300); }
  h.expect((await vis(p.getByRole("button", { name: "Все клиенты" })).count()) === 0, "no «Все клиенты» button");
  const before = await vis(p.locator(card)).count();
  const open = h.layout.width === 1280 ? vis(ibar.getByTestId("filter-group-client")).first() : vis(ibar.getByTestId("filter-button")).first();
  await open.click(); await p.waitForTimeout(400);
  const rows = h.sheet().getByRole("radio");
  const labels = await rows.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
  const i = labels.findIndex((x) => /· [1-9]\d*$/.test(x));
  h.expect(i >= 0, `a client with invoices (${labels.join(" | ")})`);
  const name = labels[i].replace(/ · \d+$/, "");
  const k = Number(labels[i].match(/· (\d+)$/)[1]);
  await rows.nth(i).click(); await p.waitForTimeout(200);
  await h.sheet().getByText("Готово", { exact: true }).click(); await p.waitForTimeout(400);
  const chip = vis(p.getByTestId("filter-chosen-client"));
  h.expect((await chip.count()) === 1 && (await chip.first().innerText()).trim() === `Клиент: ${name}`, `the chip «Клиент: ${name} ✕»`);
  h.expect((await vis(p.locator(card)).count()) === k, `only ${name}'s invoices (${k})`);
  h.expect(new URL(p.url()).searchParams.get("customer"), "the client is in the address");
  await h.shot("invoices-client");
  await chip.first().click(); await p.waitForTimeout(400);
  h.expect((await chip.count()) === 0 && (await vis(p.locator(card)).count()) === before, "✕ — every client again");

  // a report: the periods are a lane, in the row of «CSV»
  await h.go("/reports/collected?p=all");
  const rbar = vis(p.getByTestId("filter-bar")).first();
  await rbar.waitFor();
  h.expect((await vis(rbar.getByTestId("filter-search-toggle")).count()) === 0, "a report has no magnifier");
  const lane = vis(rbar.getByTestId("filter-lane")).first();
  const csv = vis(p.getByRole("button", { name: /CSV/ }));
  const [a, b] = [await lane.boundingBox(), await csv.first().boundingBox()];
  if (h.layout.width === 390) h.expect(b.y >= a.y + a.height - 1, `390: «CSV» under the lane, the lane has its own row (${JSON.stringify(a)} / ${JSON.stringify(b)})`);
  else h.expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2)) <= 8, `the lane and «CSV» in one row (${JSON.stringify(a)} / ${JSON.stringify(b)})`);
  // every period is seen: the last chip ends inside the screen
  const last = await vis(rbar.getByRole("radio")).last().boundingBox();
  h.expect(last.x + last.width <= h.layout.width, `the four periods fit (${JSON.stringify(last)})`);
  const chips = vis(rbar.getByRole("radio"));
  h.expect((await chips.count()) === 4, "four periods");
  await vis(rbar.locator('[role="radio"][aria-checked="false"]')).first().click(); await p.waitForTimeout(400);
  h.expect(new URL(p.url()).searchParams.get("p") !== "all", `the period changed in the address (${p.url()})`);
  await h.shot("report-periods");
};
