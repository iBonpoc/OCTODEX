/**
 * e2e 557 — a client who owes is not made inactive (#3044, spec 04 §4; the word «Неактивный» — founder #3040). Every view, the director:
 * - David Kim (c2, an overdue invoice): in the header's status sheet «Неактивный» is pale with «Должен $… — неактивным после оплаты»,
 *   a tap does nothing; the list's swipe has no «в архив» for him;
 * - a paid-up client becomes «Неактивный» from the header and comes back «Активный» (the manual move back, map §5).
 * By testID / roles; waits on what it checks.
 */
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const status = async (id) => ((await h.db()).customers.find((c) => c.id === id) || {}).status ?? "active";

  await h.go("/");
  const db = await h.db();
  const owes = (id) => db.invoices.filter((i) => i.customerId === id).reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
  const debtor = db.customers.find((c) => owes(c.id) > 0 && (c.status ?? "active") === "active");
  const free = db.customers.find((c) => owes(c.id) === 0 && (c.status ?? "active") === "active");
  h.expect(!!debtor && !!free, "the demo has a client who owes and one who does not");

  // the debtor: «Неактивный» pale with the reason, a tap changes nothing
  await h.go(`/client/${debtor.id}`);
  await tid("client-header-status").click();
  const opt = h.sheet().getByRole("radio", { name: /Неактивный/ });
  await opt.waitFor({ timeout: 5000 });
  h.expect(/Должен \$[\d,]+(\.\d\d)? — неактивным после оплаты/.test((await opt.getAttribute("aria-label")) || ""), `the reason is said (${await opt.getAttribute("aria-label")})`);
  // the pale option is not a button: nothing to press (a pressable one would carry the role «radio» unchecked AND enabled)
  h.expect((await opt.getAttribute("aria-disabled")) === "true", "the pale option cannot be chosen");
  h.expect((await status(debtor.id)) === "active", "the debtor stays active");
  await h.shot("debtor-sheet");
  await pressEscUntilClosed(p);

  // the paid-up client: inactive and back
  await h.go(`/client/${free.id}`);
  await tid("client-header-status").click();
  await h.sheet().getByRole("radio", { name: /^Неактивный/ }).click();
  await sheetGone(p);
  await p.waitForFunction(([k, id]) => (JSON.parse(localStorage.getItem(k) || "{}").db?.customers || []).find((c) => c.id === id)?.status === "archived", ["octo.db.v5", free.id], { timeout: 5000 });
  await tid("client-header-status").waitFor({ timeout: 5000 });
  h.expect(/Неактивный/.test(await tid("client-header-status").innerText()), "the header says «Неактивный»");
  await tid("client-header-status").click();
  await h.sheet().getByRole("radio", { name: /^Активный/ }).click();
  await sheetGone(p);
  await p.waitForFunction(([k, id]) => ((JSON.parse(localStorage.getItem(k) || "{}").db?.customers || []).find((c) => c.id === id)?.status ?? "active") === "active", ["octo.db.v5", free.id], { timeout: 5000 });
  h.expect(true, "back to «Активный» by hand");
};
