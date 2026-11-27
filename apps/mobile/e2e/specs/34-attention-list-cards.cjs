const { dueKey, todayKey } = require("../companyTime.cjs");
/**
 * «Требует внимания» (step 10а, PR7 → prototype v2 #2350 макет 1), every view (3 widths × 2 themes), by testID:
 * - «Главная»: «Требует действия» is the 2 × 2 tiles; «Должны» (`tile-owed`) = what every owed invoice still owes, with the count
 *   of the overdue ones (by the company's day) — and it opens exactly those debts (`/invoice?f=owed`); «Лиды без ответа» opens the leads;
 *   «Все ›» (`home-attention-all`) opens «Разбор»;
 * - «Разбор»: the rest of the queue are cards that open their record;
 * - a technician never gets «Главная» of the office / «Разбор» (route guard → his visits, no tiles, no debts); no «…».
 */
// #2888: the app shows money always with cents (founder #2672)
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/today");
  const db = await h.db();
  const today = todayKey(); // overdue = due before the company's today (П4b)
  await tid("today-tiles").waitFor({ timeout: 8000 });

  // «Должны»: every balance, the overdue ones counted
  const owes = (i) => Math.max(0, i.totalCents - i.paidCents);
  const owed = db.invoices.filter((i) => owes(i) > 0);
  const late = owed.filter((i) => dueKey(i.dueDate) < today);
  const sum = owed.reduce((s, i) => s + owes(i), 0);
  const tile = (await tid("tile-owed").innerText()).replace(/\n/g, " | ");
  h.expect(tile.includes(usd.format(sum / 100)), `«Должны» = ${usd.format(sum / 100)}: ${tile}`);
  if (late.length) h.expect(new RegExp(`${late.length} просроч`).test(tile), `«${late.length} просроч.» on the tile: ${tile}`);
  h.expect(!/…|\.\.\./.test(await tid("today-attention").innerText()), "no «…» in «Требует действия»");
  await h.shot("today");

  // each tile opens exactly what it counts
  await tid("tile-owed").click();
  await p.waitForURL((u) => u.pathname === "/invoice" && u.searchParams.get("f") === "owed", { timeout: 5000 });
  h.expect(true, `«Должны» opens the debts (${p.url()})`);
  await h.go("/today");
  await tid("tile-leads").click();
  await p.waitForURL(/\/leads/, { timeout: 5000 });
  h.expect(true, `«Лиды без ответа» opens the leads (${p.url()})`);

  // «Все ›» → «Разбор»: the rest of the queue are cards that open their record
  await h.go("/today");
  await tid("home-attention-all").click();
  await p.waitForURL(/\/triage/, { timeout: 5000 });
  const rest = p.locator('[data-testid="list-card"]').locator("visible=true");
  await rest.first().waitFor({ timeout: 8000 });
  const u = p.url();
  await rest.first().click({ position: { x: 20, y: 20 } });
  await p.waitForURL((x) => x.href !== u, { timeout: 5000 });
  h.expect(p.url() !== u, `a queue card opens its record (${p.url()})`);
  await h.shot("triage");

  // technician: «Главная» of the office and «Разбор» are closed (route guard) — he lands on his visits: no tiles, no debts
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  // what the tech really sees: the open screen only (a tab he was sent away from stays mounted, hidden with aria-hidden)
  const shownText = () => p.evaluate(() => { const c = document.body.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove()); return c.innerText || c.textContent; });
  const shownCount = (sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((n) => !n.closest('[aria-hidden="true"]') && n.offsetParent !== null).length, sel);
  for (const path of ["/today", "/triage"]) {
    await h.go(path);
    await p.waitForURL(/\/visits/, { timeout: 5000 });
    h.expect(new URL(p.url()).pathname === "/visits", `tech ${path} → /visits (got ${p.url()})`);
    await tid("visits").waitFor({ timeout: 8000 });
    const body = await shownText();
    h.expect((await shownCount('[data-testid="tile-owed"]')) === 0 && (await shownCount('[data-testid="today-tiles"]')) === 0, `tech: no office tiles after ${path}`);
    h.expect(!/Должны/.test(body) && !body.includes(usd.format(sum / 100)), `tech sees no debts after ${path}`);
  }
};
