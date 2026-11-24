/**
 * The clients list in the v2 List template (#2350, CLAUDE.md rule 12; was the list cards of step 10а): every view, by testID.
 * One card of GroupRows `client-row-<id>` (under 50 clients — one group, no letters): initials, the name, ONE line under it (the
 * next visit, else what happened last, else the address — never the phone), ONE money figure on the right — the debt (none —
 * no figure: a call icon instead, BUILD-SPEC §2.3); an overdue debt adds its sign «N дн». The chips strip is one row (statuses
 * and tags), one chip checked. The status from the row: a long press (the swipe on a phone) — «В архив» for a prospect, with «Отменить».
 */
const { addDays, todayKey } = require("../companyTime.cjs");
const { listChip } = require("../listScreen.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/clients");
  const db = await h.db();
  const row = (id) => p.getByTestId(`client-row-${id}`).locator("visible=true").first();
  const usd = (n) => { const d = n % 100 === 0 ? 0 : 2; return "$" + (n / 100).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); };
  const cents = (c) => {
    const inv = db.invoices.filter((i) => i.customerId === c.id && !i.void);
    const owed = inv.reduce((s, i) => s + Math.max(0, i.totalCents - i.paidCents), 0);
    const paid = Math.max(0, db.payments.filter((x) => x.customerId === c.id).reduce((s, x) => s + x.amountCents, 0));
    return { owed, paid };
  };
  const money = (t) => t.match(/\$[\d,]+(\.\d\d)?/g) ?? [];

  // a client who owes: one line under the name (no phone), the debt the one figure
  const owes = db.customers.find((c) => (c.status ?? "active") === "active" && cents(c).owed > 0);
  h.expect(owes, "demo has a client who owes");
  await row(owes.id).scrollIntoViewIfNeeded();
  const txt = await row(owes.id).innerText();
  const prop = db.properties.find((x) => x.customerId === owes.id);
  h.expect(txt.split("\n").filter(Boolean).length >= 2 && (/\d{1,2}:\d\d [AP]M/.test(txt) || txt.includes(prop.address) || /·/.test(txt)), `one line under the name: ${txt.slice(0, 160)}`);
  h.expect(!txt.includes(owes.phone), "no phone line on the row");
  h.expect(money(txt).length === 1 && money(txt)[0] === usd(cents(owes).owed), `the debt is the one figure (${money(txt)})`);
  // the figure stands right of the name, on its line
  const pos = await row(owes.id).evaluate((root, args) => {
    const leaf = (txt) => [...root.querySelectorAll("div")].find((d) => d.textContent.trim() === txt && !d.querySelector("div"));
    const a = leaf(args.amount), n = leaf(args.name);
    if (!a || !n) return null;
    const ra = a.getBoundingClientRect(), rn = n.getBoundingClientRect();
    return { right: ra.left > rn.left, inRow: ra.top < rn.bottom + 24 };
  }, { amount: usd(cents(owes).owed), name: owes.name });
  h.expect(pos && pos.right && pos.inRow, `the debt right of the name (${JSON.stringify(pos)})`);
  // a client who paid and owes nothing: no money figure on the row
  const paidOnly = db.customers.find((c) => (c.status ?? "active") === "active" && cents(c).owed === 0 && cents(c).paid > 0);
  h.expect(paidOnly, "demo has a client who paid and owes nothing");
  h.expect(money(await row(paidOnly.id).innerText()).length === 0, `${paidOnly.name}: no figure when nothing is owed`);
  // under 50 clients: one group, no letter headers
  h.expect((await p.locator('[data-testid^="clients-group-"]').locator("visible=true").count()) === 1, "one group of rows");
  h.expect(!/…|\.\.\./.test(await p.getByTestId("clients-groups").locator("visible=true").first().innerText()), "no «…» in the list's words");
  await h.shot("list");

  // the overdue sign: the days of the oldest overdue invoice
  const late = db.invoices.filter((i) => i.customerId === owes.id && i.paidCents < i.totalCents);
  await p.evaluate(({ ids, due }) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.invoices = raw.db.invoices.map((i) => (ids.includes(i.id) ? { ...i, dueDate: due } : i));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, { ids: late.map((i) => i.id), due: addDays(todayKey(), -9) });
  await h.go("/clients");
  const lateTxt = await row(owes.id).innerText();
  h.expect(/(^|\s)9 дн(\s|$)/.test(lateTxt) && money(lateTxt).length === 1, `overdue sign «9 дн» and still one figure: ${lateTxt.slice(0, 200)}`);
  await h.shot("overdue");

  // the chips: one row, one checked, an empty filter has no «0»
  const chips = p.getByTestId("clients-chips").locator("visible=true").first().getByRole("radio");
  const ys = await chips.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  h.expect(ys.length >= 2 && ys.every((y) => Math.abs(y - ys[0]) <= 1), `the chips in one row (${ys.join(", ")})`);
  h.expect((await p.getByTestId("clients-chips").locator("visible=true").first().locator('[role="radio"][aria-checked="true"]').count()) === 1, "the chosen chip is announced as checked (web a11y)");
  const chipText = (await chips.allInnerTexts()).join(" | ");
  h.expect(!/\b0\b/.test(chipText), `no «0» on a chip: ${chipText}`);
  const first = await p.locator('[data-testid^="client-row-"]').locator("visible=true").first().boundingBox();
  h.expect(h.layout.width !== 390 || first.y < 844 * 0.4, `390: the first row starts in the top 40 % of the screen (${first.y})`);

  // status from the row: prospect → archive in one move, then «Отменить».
  const target = db.customers.filter((c) => (c.status ?? "active") === "active" && cents(c).owed === 0).sort((a, b) => a.name.localeCompare(b.name))[0];
  await p.evaluate((id) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.customers = raw.db.customers.map((c) => (c.id === id ? { ...c, status: "prospect" } : c));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, target.id);
  await h.go("/clients");
  await listChip(p, "clients", /^Потенциальные \d+$/).click();
  await row(target.id).waitFor();
  h.expect(/Потенциальный/.test(await row(target.id).innerText()), "the prospect's status on its row");
  // a long press opens the row's actions (the same as the swipe and VoiceOver's actions)
  const box = await row(target.id).boundingBox();
  await p.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
  await p.mouse.down();
  await p.getByTestId(`client-row-swipe-archive-${target.id}-menu`).locator("visible=true").first().waitFor({ timeout: 3000 });
  await p.mouse.up();
  await p.getByTestId(`client-row-swipe-archive-${target.id}-menu`).locator("visible=true").first().click();
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.customers.find((c) => c.id === id)?.status === "archived", target.id, { timeout: 5000 });
  await h.shot("archived");
  await p.locator('[data-testid="toast-undo"][aria-busy="false"]').locator("visible=true").first().click();
  await p.waitForFunction((id) => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.customers.find((c) => c.id === id)?.status === "prospect", target.id, { timeout: 5000 });
};
