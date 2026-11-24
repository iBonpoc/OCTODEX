/**
 * Wave 2c-1б — variant Б of the navigation (founder 06.11; docs/specs/13 v2 §2.1, §2.3, §2.4, §2.5), prototype v2:
 * - phone: 5 tabs Главная · План · Клиенты · Деньги · Лиды; no «Звонки» tab, no ☰ in the header; «Ещё» is the avatar;
 * - «Ещё»: the profile card with the connection status, then the rows of the sections by rights;
 *   a row opens its section, no tab is lit there (HIG), «‹ Ещё» comes back; Звонки and Сообщения are rows;
 * - the floating «＋» never covers the last card of a list;
 * - 820/1280: no bottom tabs; the side menu has Звонки and no «Ещё»; /more still shows the tiles.
 */
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  const w = h.layout.width;
  const wide = w >= 820;
  const screen = () => p.locator('[data-testid="more-screen"]:visible');
  const tile = (id) => p.locator(`[data-testid="more-${id}"]:visible`);
  const box = async (l) => (await l.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/today");

  if (!wide) {
    for (const name of ["Главная", "План", "Клиенты", "Деньги", "Лиды"]) h.expect((await p.getByRole("tab", { name, exact: true }).count()) === 1, `tab «${name}»`);
    for (const name of ["Звонки", "Сообщения", "Ещё"]) h.expect((await p.getByRole("tab", { name, exact: true }).count()) === 0, `no «${name}» tab`);
    h.expect((await p.getByRole("button", { name: "Меню", exact: true }).count()) === 0, "no ☰ in the header");
    await p.getByTestId("home-profile").locator("visible=true").first().click();
    await p.waitForURL(/\/more/, { timeout: 5000 });
    h.expect(path(h) === "/more", `the avatar → /more (${p.url()})`);
  } else {
    h.expect((await p.getByRole("tab", { name: "Ещё", exact: true }).count()) === 0, "820/1280: no «Ещё» tab");
    h.expect((await p.getByTestId("side-calls").count()) === 1 && (await p.getByTestId("side-more").count()) === 0, "the side menu: Звонки, no «Ещё»");
    await h.go("/more");
  }

  // the profile card and the connection status, then the tiles
  await screen().waitFor({ timeout: 3000 });
  h.expect((await p.locator('[data-testid="more-profile"]:visible').count()) === 1, "the profile card");
  h.expect(/Онлайн · всё сохранено/.test(await p.locator('[data-testid="more-sync"]:visible').innerText()), "the connection status");
  for (const id of ["messages", "jobs", "calls", "estimates", "invoices", "catalog", "payments", "reports", "money", "team", "company", "settings"]) h.expect((await tile(id).count()) === 1, `director: tile «${id}»`);
  for (const id of ["home", "plan", "clients", "finance", "leads", "more"]) h.expect((await tile(id).count()) === 0, `the tab «${id}» is not repeated`);
  await h.shot("more");

  // a tile opens its section; on the phone «Ещё» stays lit and «‹ Ещё» comes back
  await tile("jobs").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/jobs", `tile → /jobs (${p.url()})`);
  if (!wide) {
    await p.getByTestId("back-more").locator("visible=true").click();
    await p.waitForTimeout(600);
    h.expect(path(h) === "/more", `«‹ Ещё» → /more (${p.url()})`);
    await tile("messages").click();
    await p.getByTestId("back-more").locator("visible=true").first().waitFor({ timeout: 5000 });
    h.expect((await p.locator('[data-testid="tab-bar"]:visible [role="tab"][aria-selected="true"]').count()) === 0, "a section of «Ещё» (Сообщения) lights no tab");
  }

  // the technician: no money, team, company, invoices tiles; «Лиды» — his own (#327) — is his tab, not a tile
  await setRole(h, "tech");
  await h.go("/more");
  await screen().waitFor({ timeout: 3000 });
  for (const id of ["invoices", "payments", "reports", "money", "team", "company"]) h.expect((await tile(id).count()) === 0, `tech: no tile «${id}»`);
  for (const id of ["jobs", "estimates", "catalog", "calls", "settings"]) h.expect((await tile(id).count()) === 1, `tech: tile «${id}»`);
  h.expect((await tile("leads").count()) === 0, "tech: «Лиды» is a tab, not a tile");
  await setRole(h, "director");

  // nothing floats on a list (#1395): the last card is not covered by the bar (phone)
  if (!wide) {
    await h.go("/clients");
    await p.evaluate(() => document.querySelectorAll("*").forEach((el) => el.scrollHeight > el.clientHeight + 4 && (el.scrollTop = el.scrollHeight)));
    await p.waitForTimeout(500);
    h.expect((await p.getByTestId("fab").locator("visible=true").count()) === 0, "no floating «＋» on Clients");
    const cards = p.locator('[data-testid^="client-row-c"]:not([data-testid^="client-row-call-"]):visible');
    const last = await box(cards.last());
    const bar = await box(p.getByTestId("tab-bar").locator("visible=true"));
    h.expect(last.y + last.height <= bar.y + 1, `the last card ends above the bar (${last.y + last.height} vs ${bar.y})`);
  }

  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${w}`);
};
