const { listSearch, listSearchClear } = require("../listSearch.cjs");
/**
 * «Расходы», «Счета» и отчёты по одному правилу фильтров (docs/specs/31-list-filters.md, director 07.11), every view:
 * - «Расходы»: a magnifier (vendor, category, work, client, who paid); nothing found — «В этом отборе никого нет»; ✕ — all;
 * - «Счета» (prototype v2 #2350, the List template — no FilterBar, no «Фильтры» sheet): one client's invoices are the address
 *   `?customer=` (a client's «Должен»): the client's name is the title, only his rows (`invoice-row-<id>`); «‹» — back to that client;
 *   no «Все клиенты» button;
 * - a report: the periods are a lane (no magnifier), in one row with «CSV» (a phone: «CSV» under it); a tap changes the period.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (loc) => loc.locator("visible=true");
  const card = '[data-testid^="expense-row-"]'; // lists B (#2992): an expense is a row
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

  // «Счета»: one client's invoices by the address; «‹» — every client again
  await h.go("/invoice?f=all");
  const irows = () => p.evaluate(() => [...document.querySelectorAll('[data-testid^="invoice-row-"]')].filter((e) => e.offsetParent !== null && !/-swipe$/.test(e.getAttribute("data-testid"))).map((e) => e.getAttribute("data-testid").slice("invoice-row-".length)));
  await vis(p.getByTestId("invoice-list-groups")).first().waitFor({ timeout: 8000 });
  h.expect((await vis(p.getByRole("button", { name: "Все клиенты" })).count()) === 0, "no «Все клиенты» button");
  const before = (await irows()).length;
  h.expect(before === db.invoices.length, `every invoice is a row (${before} / ${db.invoices.length})`);
  const counts = db.customers.map((c) => ({ c, n: db.invoices.filter((i) => i.customerId === c.id).length })).filter((x) => x.n > 0 && x.n < db.invoices.length);
  h.expect(counts.length > 0, "a client with some of the invoices");
  const { c: client, n: k } = counts[0];
  await vis(p.getByTestId(`invoice-row-${db.invoices.find((i) => i.customerId === client.id).id}`)).first().waitFor({ timeout: 3000 });
  await h.go(`/invoice?f=all&customer=${client.id}`);
  await vis(p.getByTestId("invoice-list-groups")).first().waitFor({ timeout: 8000 });
  h.expect((await vis(p.getByTestId("screen-title")).first().innerText()).includes(client.name), `the title is the client «${client.name}»`);
  const mine = await irows();
  h.expect(mine.length === k && mine.every((id) => db.invoices.find((i) => i.id === id)?.customerId === client.id), `only ${client.name}'s invoices (${k}: ${mine.join(", ")})`);
  h.expect(new URL(p.url()).searchParams.get("customer") === client.id, "the client is in the address");
  await h.shot("invoices-client");
  // «‹» goes back to the client (where «Должен» came from); the list without `?customer=` is every client again
  // a phone: the header's «‹ Sarah Mitchell»; 820/1280: the crumb «Главная › Клиенты › Sarah Mitchell» — both «Назад: <client>»
  const up = vis(p.getByRole("button", { name: `Назад: ${client.name}`, exact: true })).first();
  await up.waitFor({ timeout: 5000 });
  await up.click();
  await p.waitForURL(new RegExp(`/client/${client.id}`), { timeout: 5000 });
  await h.go("/invoice?f=all");
  await vis(p.getByTestId("invoice-list-groups")).first().waitFor({ timeout: 5000 });
  h.expect((await irows()).length === before, "without the client — every invoice again");

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
