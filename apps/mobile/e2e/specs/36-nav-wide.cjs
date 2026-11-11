/**
 * Tablet and desktop navigation (spec 10, Н2–Н3; 13 §2.5): the side menu stays on inner screens with the section
 * marked (it replaced the top pill, wave 2b); a round «‹» goes one level up; Esc goes one level up (an open menu
 * closes first). Phone: the bottom bar is on inner screens too (rule А, docs/specs/28) with the card's section lit; no «‹».
 */
const { escOnPage, pressEscUntilClosed } = require("../sheet.cjs");
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
  const side = (id) => p.getByTestId(`side-${id}`);
  const marked = async (id) => (await side(id).getAttribute("aria-current")) === "page";
  // «‹» and the parent crumb share one name (same action, WCAG 3.2.4); «‹» comes first
  const up = (to) => p.getByRole("button", { name: `Назад: ${to}`, exact: true }).locator("visible=true").first();
  const roundBack = () => p.locator('[aria-label^="Назад"]:visible').filter({ has: p.locator("svg") }).filter({ hasNotText: /./ });

  const focused = () => p.evaluate(() => { const e = document.activeElement; return e ? `${e.getAttribute("role") || e.tagName}|${e.getAttribute("aria-label") || ""}|${(e.textContent || "").slice(0, 60)}` : ""; });

  // Н1: the pill on an inner screen, "Клиенты" highlighted
  await h.go(`/client/${cust.id}`);
  // Н3а: the screen title is a real heading (all widths)
  h.expect((await p.locator('[role="heading"][aria-level="1"]:visible').count()) === 1, "title is a level-1 heading");
  if (!wide) {
    // rule А (docs/specs/28): the bottom bar stays on a card, its section («Клиенты») lit
    h.expect((await tab("Главная").count()) === 1 && (await p.locator('[role="tab"][aria-label="Клиенты"][aria-selected="true"]:visible').count()) === 1, "phone: the bottom bar on an inner screen, «Клиенты» lit");
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
  h.expect((await p.getByTestId("side-nav").count()) === 1 && (await tab("Клиенты").count()) === 0, "the side menu on the client card, no top pill");
  h.expect(await marked("clients"), "Clients marked");
  await h.shot("client-side");
  // another section in one tap
  await side("plan").click();
  await p.waitForTimeout(600);
  h.expect(/\/plan/.test(p.url()), `side menu → Plan from a client (${p.url()})`);
  h.expect(await marked("plan"), "Plan marked");

  // another role's home (the owner opens Triage): «Главная» marked, the trail at the top of the screen, right of the menu
  await h.go("/triage");
  h.expect(await marked("home"), "/triage: Home marked");
  const nav = await p.getByTestId("side-nav").boundingBox();
  const crumb = await p.getByRole("button", { name: "Назад: Главная", exact: true }).locator("visible=true").first().boundingBox();
  h.expect(!!crumb && crumb.x >= nav.x + nav.width, `/triage: trail right of the menu (${crumb && crumb.x} vs ${nav.x + nav.width})`);

  // estimate: a ☰ section — «Сметы» marked
  await h.go(`/estimate/${db.estimates[0].id}`);
  h.expect(await marked("estimates"), "Estimates marked on an estimate");

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
  await escOnPage(p);
  await p.waitForTimeout(600);
  h.expect(p.url().includes(`/client/${owner}`), `Esc job → client (${p.url()})`);
  const status = p.getByRole("button", { name: /^Статус клиента/ }).locator("visible=true").first();
  if (await status.count()) {
    await status.click();
    await p.waitForTimeout(300);
    h.expect((await p.getByRole("menu").locator("visible=true").count()) > 0, "status menu open");
    await pressEscUntilClosed(p, p.getByRole("menu").locator("visible=true").first());
    await p.waitForTimeout(500);
    h.expect((await p.getByRole("menu").locator("visible=true").count()) === 0, "Esc closed the menu");
    h.expect(p.url().includes(`/client/${owner}`), `…and stayed on the client (${p.url()})`);
  } else {
    h.expect(false, "the client's status button is on the client screen");
  }
  await escOnPage(p);
  await p.waitForTimeout(600);
  h.expect(/\/clients$/.test(p.url()), `Esc client → clients (${p.url()})`);

  // Esc while typing in a field does not leave the screen
  await h.go(`/client/edit?id=${cust.id}`);
  const field = p.locator("input:visible").first();
  await field.click();
  await escOnPage(p);
  await p.waitForTimeout(600);
  h.expect(p.url().includes("/client/edit"), `Esc in a field stays (${p.url()})`);

  let f = "";
  // Н3а: focus after a move. Down → the new screen's title; back up → where you left (the client's card in the list)
  await h.go("/clients");
  const card = p.getByRole("button", { name: new RegExp(cust.name) }).locator("visible=true").first();
  await card.focus();
  const cardLabel = await card.getAttribute("aria-label");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(700);
  if (h.layout.width >= 1280) {
    // 1280: Enter opens the panel beside the list, the focus stays on the card; Esc closes it (spec 06 «Панель 1280»)
    h.expect(p.url().includes(`open=${cust.id}`), `1280: Enter opens the panel (${p.url()})`);
    await escOnPage(p);
    await p.waitForTimeout(500);
    f = await focused();
    h.expect(/\/clients$/.test(p.url()) && f.includes(cardLabel || cust.name), `1280: Esc closes the panel, focus on the card (${f})`);
    await card.focus();
    await p.keyboard.press("Enter");
    await p.getByTestId("list-panel-open").locator("visible=true").click();
    await p.waitForTimeout(700);
  }
  h.expect(p.url().includes(`/client/${cust.id}`), `Enter opens the client (${p.url()})`);
  f = await focused();
  h.expect(f.startsWith("heading|") && f.includes(cust.name), `focus on the new title (${f})`);
  const ring = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  h.expect(ring === "none", `the title has no focus ring (${ring})`);
  await escOnPage(p);
  await p.waitForTimeout(700);
  f = await focused();
  // 1280: back to the list with the same card open in the panel (spec 06 «Панель 1280»)
  h.expect(/\/clients(\?open=[\w-]+)?$/.test(p.url()) && f.includes(cardLabel || cust.name), `Esc back → focus on the card left (${f})`);
  // nothing remembered (opened by a link): back up lands on the title
  await h.go(`/job/${job.id}`);
  await escOnPage(p);
  await p.waitForTimeout(700);
  f = await focused();
  h.expect(f.startsWith("heading|") && f.includes(ownerName), `no memory → title (${f})`);
};
