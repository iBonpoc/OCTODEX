/**
 * Wave 2c-1б — variant Б of the navigation (founder 06.11; docs/specs/13 v2 §2.1, §2.3, §2.4, §2.5):
 * - phone: 5 tabs Главная · План · Сообщения · Клиенты · Ещё; no «Звонки» tab, no ☰ in the header;
 * - «Ещё»: the profile card with the connection status, then the tiles of the sections by rights;
 *   a tile opens its section, «Ещё» stays lit, «‹ Ещё» comes back; Звонки is a tile;
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
    for (const name of ["Главная", "План", "Сообщения", "Клиенты", "Ещё"]) h.expect((await p.getByRole("tab", { name, exact: true }).count()) === 1, `tab «${name}»`);
    h.expect((await p.getByRole("tab", { name: "Звонки", exact: true }).count()) === 0, "no «Звонки» tab");
    h.expect((await p.getByRole("button", { name: "Меню", exact: true }).count()) === 0, "no ☰ in the header");
    await p.getByRole("tab", { name: "Ещё", exact: true }).click();
    await p.waitForTimeout(600);
    h.expect(path(h) === "/more", `«Ещё» → /more (${p.url()})`);
  } else {
    h.expect((await p.getByRole("tab", { name: "Ещё", exact: true }).count()) === 0, "820/1280: no «Ещё» tab");
    h.expect((await p.getByTestId("side-calls").count()) === 1 && (await p.getByTestId("side-more").count()) === 0, "the side menu: Звонки, no «Ещё»");
    await h.go("/more");
  }

  // the profile card and the connection status, then the tiles
  await screen().waitFor({ timeout: 3000 });
  h.expect((await p.locator('[data-testid="more-profile"]:visible').count()) === 1, "the profile card");
  h.expect(/Онлайн · всё сохранено/.test(await p.locator('[data-testid="more-sync"]:visible').innerText()), "the connection status");
  for (const id of ["leads", "jobs", "calls", "estimates", "invoices", "catalog", "money", "team", "company", "settings"]) h.expect((await tile(id).count()) === 1, `director: tile «${id}»`);
  for (const id of ["home", "plan", "messages", "clients", "more"]) h.expect((await tile(id).count()) === 0, `the tab «${id}» is not repeated`);
  await h.shot("more");

  // a tile opens its section; on the phone «Ещё» stays lit and «‹ Ещё» comes back
  await tile("jobs").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/jobs", `tile → /jobs (${p.url()})`);
  if (!wide) {
    await p.getByTestId("back-more").locator("visible=true").click();
    await p.waitForTimeout(600);
    h.expect(path(h) === "/more", `«‹ Ещё» → /more (${p.url()})`);
    await tile("leads").click();
    await p.waitForTimeout(700);
    h.expect((await p.getByRole("tab", { name: "Ещё", selected: true }).count()) === 1, "«Ещё» is lit on Leads");
  }

  // the technician: no money, team, company, invoices, leads tiles
  await setRole(h, "tech");
  await h.go("/more");
  await screen().waitFor({ timeout: 3000 });
  for (const id of ["invoices", "money", "team", "company", "leads"]) h.expect((await tile(id).count()) === 0, `tech: no tile «${id}»`);
  for (const id of ["jobs", "estimates", "catalog", "calls", "settings"]) h.expect((await tile(id).count()) === 1, `tech: tile «${id}»`);
  await setRole(h, "director");

  // the floating «＋» never covers the last card (phone)
  if (!wide) {
    await h.go("/clients");
    await p.evaluate(() => document.querySelectorAll("*").forEach((el) => el.scrollHeight > el.clientHeight + 4 && (el.scrollTop = el.scrollHeight)));
    await p.waitForTimeout(500);
    const cards = p.locator('[data-testid="list-card"]:visible');
    const last = await box(cards.last());
    const fab = await box(p.getByTestId("fab").locator("visible=true"));
    h.expect(last.y + last.height <= fab.y + 1, `the last card ends above «＋» (${last.y + last.height} vs ${fab.y})`);
  }

  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${w}`);
};
