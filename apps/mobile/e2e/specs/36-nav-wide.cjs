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
  // «‹» and the parent crumb share one name (same action, WCAG 3.2.4); «‹» comes first
  const up = (to) => p.getByRole("button", { name: `Назад: ${to}`, exact: true }).locator("visible=true").first();
  const roundBack = () => p.locator('[aria-label^="Назад"]:visible').filter({ has: p.locator("svg") }).filter({ hasNotText: /./ });

  const focused = () => p.evaluate(() => { const e = document.activeElement; return e ? `${e.getAttribute("role") || e.tagName}|${e.getAttribute("aria-label") || ""}|${(e.textContent || "").slice(0, 60)}` : ""; });

  // Н1: the pill on an inner screen, "Клиенты" highlighted
  await h.go(`/client/${cust.id}`);
  // Н3а: the screen title is a real heading (all widths)
  h.expect((await p.locator('[role="heading"][aria-level="1"]:visible').count()) === 1, "title is a level-1 heading");
  if (!wide) {
    h.expect((await tab("Продажи").count()) === 0 && (await tab("Ещё").count()) === 0, "phone: no tab bar on an inner screen");
    h.expect((await roundBack().count()) === 0, "phone: no round back");
    h.expect(!/Esc/.test(await h.text()), "phone: no Esc hint");
    // the trail scrolls away with the page, as before (not pinned)
    const parent = p.getByRole("button", { name: "Назад: Клиенты" }).locator("visible=true");
    const y0 = (await parent.boundingBox()).y;
    await p.mouse.move(195, 500);
    await p.mouse.wheel(0, 600);
    await p.waitForTimeout(400);
    const box = await parent.boundingBox();
    h.expect(!box || box.y < y0 - 100, "phone: trail scrolls with the page");
    return;
  }
  h.expect((await tab("Клиенты").count()) === 1, "pill on the client card");
  h.expect((await tab("Клиенты").getAttribute("aria-selected")) === "true", "Clients highlighted");
  await h.shot("client-pill");
  // another section in one tap
  await tab("Продажи").click();
  await p.waitForTimeout(600);
  h.expect(/\/inbox/.test(p.url()), `pill → Sales from a client (${p.url()})`);

  // a tab opened from «More» (owner has no Plan/Triage in the bar): exactly one pill, the trail is not covered
  for (const route of ["/plan", "/triage"]) {
    await h.go(route);
    h.expect((await tab("Ещё").count()) === 1, `${route}: exactly one pill`);
    h.expect((await tab("Ещё").getAttribute("aria-selected")) === "true", `${route}: More highlighted`);
    const pill = await tab("Ещё").boundingBox();
    const crumb = await p.getByRole("button", { name: "Назад: Ещё", exact: true }).locator("visible=true").first().boundingBox();
    h.expect(!!crumb && crumb.y >= pill.y + pill.height, `${route}: trail below the pill (${crumb && crumb.y} vs ${pill.y + pill.height})`);
  }

  // estimate → Sales highlighted
  await h.go(`/estimate/${db.estimates[0].id}`);
  h.expect((await tab("Продажи").getAttribute("aria-selected")) === "true", "Sales highlighted on an estimate");

  // Н2: «‹» goes one level up: job → client → clients
  await h.go(`/job/${job.id}`);
  h.expect((await roundBack().count()) === 1, "round ‹ on 820/1280");
  await up(ownerName).click();
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/client/${owner}`), `‹ job → client (${p.url()})`);
  await up("Клиенты").click();
  await p.waitForTimeout(600);
  h.expect(/\/clients$/.test(p.url()), `‹ client → clients (${p.url()})`);
  h.expect((await p.getByRole("button", { name: /^Назад/ }).locator("visible=true").count()) === 0, "no ‹ on a tab root");

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

  // Esc while typing in a field does not leave the screen
  await h.go(`/client/edit?id=${cust.id}`);
  const field = p.locator("input:visible").first();
  await field.click();
  await p.keyboard.press("Escape");
  await p.waitForTimeout(600);
  h.expect(p.url().includes("/client/edit"), `Esc in a field stays (${p.url()})`);

  // Н3а: focus after a move. Down → the new screen's title; back up → where you left (the client's card in the list)
  await h.go("/clients");
  const card = p.getByRole("button", { name: new RegExp(cust.name) }).locator("visible=true").first();
  await card.focus();
  const cardLabel = await card.getAttribute("aria-label");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(700);
  h.expect(p.url().includes(`/client/${cust.id}`), `Enter opens the client (${p.url()})`);
  let f = await focused();
  h.expect(f.startsWith("heading|") && f.includes(cust.name), `focus on the new title (${f})`);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(700);
  f = await focused();
  h.expect(/\/clients$/.test(p.url()) && f.includes(cardLabel || cust.name), `Esc back → focus on the card left (${f})`);
  // nothing remembered (opened by a link): back up lands on the title
  await h.go(`/job/${job.id}`);
  await p.keyboard.press("Escape");
  await p.waitForTimeout(700);
  f = await focused();
  h.expect(f.startsWith("heading|") && f.includes(ownerName), `no memory → title (${f})`);
};
