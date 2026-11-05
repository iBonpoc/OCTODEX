/**
 * Tablet and desktop navigation (spec 10, Н1–Н3, founder 05.11.2026):
 * the top pill stays on inner screens with the section highlighted; a round «‹» goes one level up;
 * Esc goes one level up (an open menu closes first). Phone: unchanged — no pill on inner screens, no «‹».
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  await h.go("/today");
  const db = await h.db();
  const cust = db.customers[0];
  const job = db.jobs.find((j) => db.properties.find((x) => x.id === j.propertyId)?.customerId === cust.id) ?? db.jobs[0];
  const owner = db.properties.find((x) => x.id === job.propertyId).customerId;
  const ownerName = db.customers.find((c) => c.id === owner).name;
  // screens below in the stack stay in the page (hidden): count only what is on screen
  const tab = (name) => p.locator(`[role="tab"][aria-label="${name}"]:visible`);
  const up = (to) => p.getByRole("button", { name: `На уровень вверх: ${to}` }).locator("visible=true");

  // Н1: the pill on an inner screen, "Клиенты" highlighted
  await h.go(`/client/${cust.id}`);
  if (!wide) {
    h.expect((await tab("Продажи").count()) === 0 && (await tab("Ещё").count()) === 0, "phone: no tab bar on an inner screen");
    h.expect((await p.getByRole("button", { name: /^На уровень вверх/ }).locator("visible=true").count()) === 0, "phone: no round back");
    return;
  }
  h.expect((await tab("Клиенты").count()) === 1, "pill on the client card");
  h.expect((await tab("Клиенты").getAttribute("aria-selected")) === "true", "Clients highlighted");
  await h.shot("client-pill");
  // another section in one tap
  await tab("Продажи").click();
  await p.waitForTimeout(600);
  h.expect(/\/inbox/.test(p.url()), `pill → Sales from a client (${p.url()})`);

  // estimate → Sales highlighted
  await h.go(`/estimate/${db.estimates[0].id}`);
  h.expect((await tab("Продажи").getAttribute("aria-selected")) === "true", "Sales highlighted on an estimate");

  // Н2: «‹» goes one level up: job → client → clients
  await h.go(`/job/${job.id}`);
  await up(ownerName).click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/client/${owner}`), `‹ job → client (${p.url()})`);
  await up("Клиенты").click();
  await p.waitForTimeout(600);
  h.expect(/\/clients$/.test(p.url()), `‹ client → clients (${p.url()})`);
  h.expect((await p.getByRole("button", { name: /^На уровень вверх/ }).locator("visible=true").count()) === 0, "no ‹ on a tab root");

  // the address bar stays put while the page scrolls
  await h.go(`/client/${cust.id}`);
  const bar = up("Клиенты");
  const y0 = (await bar.boundingBox()).y;
  await p.mouse.move(h.layout.width / 2, 500);
  await p.mouse.wheel(0, 800);
  await p.waitForTimeout(400);
  h.expect(Math.abs((await bar.boundingBox()).y - y0) < 2, "address bar pinned while scrolling");

  // Н3: Esc — one level up; an open menu closes first
  if (h.layout.width >= 1280) await h.expectText(/Esc/, "Esc hint on desktop");
  await h.go(`/job/${job.id}`);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/client/${owner}`), `Esc job → client (${p.url()})`);
  const status = p.getByRole("button", { name: /^Статус клиента/ }).locator("visible=true").first();
  if (await status.count()) {
    await status.click();
    await p.waitForTimeout(300);
    h.expect((await p.getByRole("menu").locator("visible=true").count()) > 0, "status menu open");
    await p.keyboard.press("Escape");
    await p.waitForTimeout(500);
    h.expect((await p.getByRole("menu").locator("visible=true").count()) === 0, "Esc closed the menu");
    h.expect(p.url().includes(`/client/${owner}`), `…and stayed on the client (${p.url()})`);
  }
  await p.keyboard.press("Escape");
  await p.waitForTimeout(600);
  h.expect(/\/clients$/.test(p.url()), `Esc client → clients (${p.url()})`);
};
