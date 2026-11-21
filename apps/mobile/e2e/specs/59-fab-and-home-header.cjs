/**
 * Wave 2c-1 of the app shell (docs/specs/13 v2 §2.2, §2.4, §2.5, §3.14; 13а §9), prototype v2 (BUILD-SPEC «Решения по
 * умолчанию»): «＋» is a circle in the header on every width and every screen — nothing floats; it opens a menu of its
 * items (`menu-items`, each by testID — rule 19).
 * - only what works: Главная — Лид · Клиент · Смета · Расход · Работа (tech: Лид · Расход); every «＋» is a neutral circle;
 * - Plan: planners — Записать в план · Событие · Выходной; the technician has no «＋» on Plan or Clients;
 * - Client: «＋» → «Создать смету» first, then «Работа без сметы», tied to the client (#1094, S17); Job: «＋» → «Добавить
 *   выезд» to this job, «Создать смету» for its client; tech visit: Фото · Лид · Расход;
 * - «Главная»: the bell with the unread count → /notifications → a card opens its estimate; the avatar (phone) → «Ещё».
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  const w = h.layout.width;
  const wide = w >= 820;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  /** a header «＋» (a MenuButton: the testID is on its box, the press inside) */
  const plusOf = (id) => vis(id).first().getByRole("button").first();
  const menu = () => p.locator('[data-testid="menu-items"]').locator("visible=true").last();
  const item = (id) => menu().getByTestId(id);
  const openMenu = async (id) => {
    await plusOf(id).click();
    await menu().waitFor({ timeout: 3000 });
  };
  const has = async (...ids) => {
    for (const id of ids) if ((await item(id).count()) !== 1) return false;
    return true;
  };
  const lacks = async (...ids) => {
    for (const id of ids) if ((await item(id).count()) !== 0) return false;
    return true;
  };
  const box = async (l) => (await l.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const yellowOf = (l) =>
    l.evaluate((el) => {
      const bg = [el, ...el.querySelectorAll("div")].map((e) => getComputedStyle(e).backgroundColor).find((x) => x && x !== "rgba(0, 0, 0, 0)" && x !== "transparent") ?? "";
      const [r, g, b] = (bg.match(/\d+/g) ?? []).map(Number);
      return r > 200 && g > 200 && b < 120;
    });
  const noFloating = async (where) => h.expect((await vis("fab").count()) === 0, `${where}: no floating «＋»`);

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/today");

  // one «＋» on Главная, in the header, 40 visible
  h.expect((await vis("today-create").count()) === 1, `${w}: one «＋» on Главная`);
  await noFloating("Главная");
  const hb = await box(plusOf("today-create"));
  const head = await box(vis("screen-head").first());
  h.expect(hb.y >= head.y - 1 && hb.y + hb.height <= head.y + head.height + 1, `${w}: the «＋» is in the header (${hb.y} in ${head.y}..${head.y + head.height})`);
  h.expect(Math.round(hb.height) <= 44, `visible ≤ 44 (${hb.height})`);
  // v2 «Корень вкладки»: the «＋» is one of the header's neutral circles (the one yellow is the main step)
  h.expect(!(await yellowOf(plusOf("today-create"))), `${w}: the «＋» of «Главная» is a neutral circle, not yellow`);
  if (wide) {
    // the side menu's «＋ Создать», when there: neutral, so «Главная» has one yellow (DS §3.1 п.3, §5.3, #1395)
    const create = p.getByTestId("side-nav").getByRole("button", { name: "Создать", exact: true });
    if (await create.count()) h.expect(!(await yellowOf(create)), `${w}: «Создать» in the side menu is not yellow`);
  }

  // Главная: only what works
  await openMenu("today-create");
  h.expect(await has("fab-lead", "fab-client", "fab-estimate", "fab-job", "fab-expense"), "Главная «＋»: lead, client, estimate, job, expense");
  h.expect(await lacks("fab-photo", "fab-task"), "Главная «＋» has no photo and no task yet");
  await h.shot("home-sheet");
  await item("fab-client").click();
  await p.waitForURL(/\/client\/edit/, { timeout: 5000 });
  h.expect(path(h) === "/client/edit", `«Новый клиент» → /client/edit (${p.url()})`);

  // the bell and the profile on Главная
  const now = new Date().toISOString();
  const db = await h.db();
  const est = db.estimates.find((e) => e.number);
  await p.evaluate(([n]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.notices = [n, ...raw.db.notices.filter((x) => !x.id.startsWith("e2e-"))];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [{ id: "e2e-bell", kind: "estimate.viewed", estimateId: est.id, customer: "Bell Client", at: now }]);
  await h.go("/today");
  const bell = vis("home-bell");
  await bell.first().waitFor({ timeout: 5000 });
  h.expect((await bell.count()) === 1, "the bell on Главная");
  const bellName = (await bell.first().getAttribute("aria-label")) ?? (await bell.first().getByRole("button").first().getAttribute("aria-label")) ?? "";
  h.expect(/Уведомления: новых \d+/.test(bellName), `the bell says how many are new (${bellName})`);
  h.expect((await vis("home-bell-badge").count()) === 1, "the count on the bell");
  h.expect((await vis("home-profile").count()) === (wide ? 0 : 1), wide ? "820/1280: the profile is in the side menu" : "390: the avatar in the header");
  await bell.first().click();
  await p.waitForURL(/\/notifications/, { timeout: 5000 });
  await h.expectText(/Bell Client/, "the injected notice is listed");
  await h.shot("notifications");
  await p.locator('[data-testid="notice-card"]:visible').filter({ hasText: "Bell Client" }).first().click();
  await p.waitForURL(new RegExp(`/estimate/${est.id}`), { timeout: 5000 });
  h.expect(path(h) === `/estimate/${est.id}`, `the card opens its estimate (${p.url()})`);

  // Clients: «Новый клиент» — a neutral circle in the header, its item goes to the form
  await h.go("/clients");
  h.expect((await vis("clients-create").count()) === 1, "Clients: one «＋» in the header");
  await noFloating("Clients");
  h.expect(!(await yellowOf(plusOf("clients-create"))), "Clients: the header «＋» is not yellow");
  await openMenu("clients-create");
  await item("clients-create-new").click();
  await p.waitForURL(/\/client\/edit/, { timeout: 5000 });
  h.expect(path(h) === "/client/edit", `Clients «＋» → /client/edit (${p.url()})`);

  // Client (#1094, S17): «＋» offers the estimate first, then «Работа без сметы», both tied to the client
  await h.go("/client/c1");
  await openMenu("client-screen-create");
  const estTop = (await box(item("client-create-estimate"))).y;
  const jobTop = (await box(item("client-create-job"))).y;
  h.expect(estTop > 0 && estTop < jobTop, `client «＋»: the estimate first, then the job (${estTop} < ${jobTop})`);
  await item("client-create-estimate").click();
  await p.waitForURL(/\/estimate\/new/, { timeout: 5000 });
  h.expect(new URL(p.url()).searchParams.get("customerId") === "c1", `client «＋» → estimate for c1 (${p.url()})`);
  await h.go("/client/c1");
  await openMenu("client-screen-create");
  await item("client-create-job").click();
  await p.waitForURL(/\/job\/new/, { timeout: 5000 });
  h.expect(new URL(p.url()).searchParams.get("customerId") === "c1", `client «＋» → «Работа без сметы» for c1 (${p.url()})`);

  // Job: «＋» → «Создать смету» for the job's client, «Добавить выезд» to this job
  await h.go("/job/j1");
  await openMenu("job-screen-create");
  await item("job-create-estimate").click();
  await p.waitForURL(/\/estimate\/new/, { timeout: 5000 });
  h.expect(!!new URL(p.url()).searchParams.get("customerId"), `job «＋» → «Создать смету» for the job's client (${p.url()})`);
  await h.go("/job/j1");
  await openMenu("job-screen-create");
  await item("job-create-visit").click();
  await p.waitForURL(/\/job\/schedule/, { timeout: 5000 });
  h.expect(new URL(p.url()).searchParams.get("jobId") === "j1", `job «＋» → schedule j1 (${p.url()})`);

  // Plan: planners — «Записать в план», «Событие», «Выходной» (the Plan's own sheets)
  await h.go("/plan");
  await openMenu("plan-create");
  h.expect(await has("plan-create-visit", "plan-create-event", "plan-create-time-off"), "Plan «＋»: visit, event, day off");
  await item("plan-create-visit").click();
  await h.expectText(/Осмотр|осмотр/, "«Записать в план» opens the Plan's sheet");
  await pressEscUntilClosed(p);
  // «Событие» and «Выходной» open the Plan's event sheet straight away (wave 5, #187/#188)
  for (const id of ["plan-create-event", "plan-create-time-off"]) {
    await openMenu("plan-create");
    await item(id).click();
    await h.expectText(/Целый день|Весь день/, `${id} opens the event sheet`);
    await pressEscUntilClosed(p);
  }

  // the technician: no «＋» on Plan and Clients; Главная — Лид · Расход; his visit — Фото · Лид · Расход
  await setRole(h, "tech");
  await h.go("/plan");
  await vis("screen-head").first().waitFor({ timeout: 5000 });
  h.expect((await vis("plan-create").count()) + (await vis("fab").count()) === 0, "tech: no «＋» on Plan (the office plans)");
  await h.go("/clients");
  await vis("screen-head").first().waitFor({ timeout: 5000 });
  h.expect((await vis("clients-create").count()) + (await vis("fab").count()) === 0, "tech: no «＋» on Clients");
  await h.go("/visits");
  await vis("visits-create").first().waitFor({ timeout: 5000 });
  h.expect((await vis("home-bell").count()) === 0, "tech: no bell (client and money notices are the office's)");
  await openMenu("visits-create");
  h.expect((await has("fab-lead", "fab-expense")) && (await lacks("fab-client", "fab-estimate", "fab-job")), "tech Главная «＋»: Лид · Расход");
  await pressEscUntilClosed(p);
  const tdb = await h.db();
  const mine = tdb.visits.find((v) => v.kind !== "inspection" && ((v.assigneeIds ?? []).includes(tdb.me) || v.techId === tdb.me));
  h.expect(!!mine, "the tech has a visit of his own");
  await h.go(`/visit/${mine.id}`);
  await openMenu("visit-screen-create");
  h.expect(await has("visit-create-photo", "visit-create-lead", "visit-create-expense"), "tech visit «＋»: Фото · Лид · Расход");
  await h.shot("visit-sheet");
  await pressEscUntilClosed(p);

  // no horizontal scroll with the «＋»
  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${w}`);
  await setRole(h, "director");
};
