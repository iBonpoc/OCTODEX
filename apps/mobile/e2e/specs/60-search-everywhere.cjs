const { listSearch } = require("../listSearch.cjs");
/**
 * Wave 2c-2 of the app shell — «Искать везде» (docs/specs/15-flows.md §1.7, §3.2; 13 v2 §2.2):
 * - the line on «Главная» opens /search with the cursor in the field; on 820/1280 the key «/» opens it from a screen;
 * - a number (EST-…) → the estimate; a phone by digits («555 0144») → the client «найдено: телефон Tom Mitchell»;
 *   an address → the property; groups by 3 with «Показать все»; nothing — «Ничего не нашлось по «…»»;
 * - the technician finds no invoices or payments.
 * - JOB-0001 → the job (by Job.number).
 */
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  const w = h.layout.width;
  const wide = w >= 820;
  const field = () => p.locator('[data-testid="search-field"] input').locator("visible=true");
  const hits = () => p.locator('[data-testid="search-hit"]:visible');
  const type = async (q) => {
    await field().fill(q);
    await p.waitForTimeout(400);
  };

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/today");

  // the line on «Главная» → /search, the cursor in the field
  await p.getByTestId("search-entry").locator("visible=true").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/search", `the line opens /search (${p.url()})`);
  await p.waitForTimeout(300);
  h.expect(await field().evaluate((el) => el === document.activeElement), "the cursor is in the field");

  // a number → the estimate
  const db = await h.db();
  const est = db.estimates.find((e) => e.number);
  await type(est.number);
  h.expect((await p.getByTestId("search-group-estimates").locator("visible=true").count()) === 1, `the Estimates group for ${est.number}`);
  await h.expectText(/найдено: номер/, "why: the number");
  await h.shot("number");
  await p.getByTestId("search-group-estimates").locator("visible=true").locator('[data-testid="search-hit"]').first().click();
  await p.waitForTimeout(700);
  h.expect(path(h) === `/estimate/${est.id}`, `the hit opens the estimate (${p.url()})`);

  // a job number → the job
  const job = db.jobs.find((j) => j.number);
  await h.go("/search");
  await type(job.number);
  h.expect((await p.getByTestId("search-group-jobs").locator("visible=true").count()) === 1, `the Jobs group for ${job.number}`);
  await p.getByTestId("search-group-jobs").locator("visible=true").locator('[data-testid="search-hit"]').first().click();
  await p.waitForTimeout(700);
  h.expect(path(h) === `/job/${job.id}`, `the hit opens the job (${p.url()})`);

  // a phone of another person of the client, by digits
  await h.go("/search");
  await type("555 0144");
  await h.expectText(/Sarah Mitchell/, "the client is found by Tom's phone");
  await h.expectText(/найдено: телефон Tom Mitchell/, "why: whose phone");

  // an address → the property
  await type("Oak Grove");
  await p.getByTestId("search-group-properties").locator("visible=true").locator('[data-testid="search-hit"]').first().click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/property/p1", `the address opens the property (${p.url()})`);

  // groups by 3 and «Показать все»
  await h.go("/search");
  await type("a");
  const clients = p.getByTestId("search-group-clients").locator("visible=true");
  h.expect((await clients.locator('[data-testid="search-hit"]').count()) === 3, "3 clients first");
  await clients.getByRole("button", { name: /Показать все/ }).click();
  await p.waitForTimeout(300);
  h.expect((await clients.locator('[data-testid="search-hit"]').count()) > 3, "«Показать все» shows the rest");

  // nothing found
  await type("zzqx");
  await h.expectText(/Ничего не нашлось по «zzqx»/, "the empty state says what was searched");
  h.expect((await hits().count()) === 0, "no hits");

  // no horizontal scroll
  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${w}`);

  // 820/1280: «/» opens it from a screen; not while typing
  if (wide) {
    await h.go("/clients");
    await p.locator("body").click({ position: { x: w - 5, y: 5 } }).catch(() => {});
    await p.keyboard.press("/");
    await p.waitForTimeout(700);
    h.expect(path(h) === "/search", `«/» opens the search (${p.url()})`);
    await h.go("/clients");
    // the list's search is an icon now (spec 31 §6 п.2а): open it — the field gets the focus
    await listSearch(p, "");
    await p.keyboard.press("/");
    await p.waitForTimeout(500);
    h.expect(path(h) === "/clients", "«/» in a field is just a character");
  }

  // the technician: no invoices or payments
  await setRole(h, "tech");
  const inv = db.invoices.find((i) => i.number);
  await h.go("/search");
  await type(inv.number);
  h.expect((await p.getByTestId("search-group-invoices").locator("visible=true").count()) === 0, "tech: no invoices");
  h.expect((await p.getByTestId("search-group-payments").locator("visible=true").count()) === 0, "tech: no payments");
  await setRole(h, "director");
};
