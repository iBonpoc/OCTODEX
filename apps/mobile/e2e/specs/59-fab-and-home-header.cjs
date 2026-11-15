/**
 * Wave 2c-1 of the app shell (docs/specs/13 v2 §2.2, §2.4, §2.5, §3.14; 13а §9):
 * - «＋» by screen and role: phone — a floating button bottom-right above the tabs; 820/1280 — «＋» in the header, no floating one;
 * - only what works: Главная — Лид · Клиент · Смета · Расход (tech: Лид · Расход); one item = straight to its screen;
 * - Plan: planners — Работа · Лид · Записать в план · Событие · Выходной; the technician has no «＋» on Plan;
 * - Client: «Создать смету» (a visible button on the card, #1094); no «＋» on the card (#1343) — «Работа без сметы» is on the «Работы» tab, tied to the client; Job: «Выезд» to this job; tech visit: Фото · Лид · Расход;
 * - «Главная»: the bell with the unread count → /notifications → a card opens its estimate; the profile → My settings.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  const w = h.layout.width;
  const wide = w >= 820;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  /** the «＋» of the open screen: floating on the phone, in the header on 820/1280 */
  const plus = () => vis(wide ? "fab-header" : "fab");
  const sheet = () => p.locator('[aria-modal="true"]').filter({ hasText: "Быстрые действия" }).last();
  /** the «＋» sheet once its items are in (the sheet slides in) */
  const sheetText = async () => {
    await sheet().waitFor({ timeout: 3000 });
    let t = "";
    for (let i = 0; i < 15; i++, await p.waitForTimeout(200)) if ((t = await sheet().innerText()) && (await sheet().locator('[data-testid^="fab-"]').count()) > 0) break;
    return t;
  };
  const closeSheet = async () => {
    await pressEscUntilClosed(p);
  };
  /** which items the open «＋» sheet has — by testID `fab-<id>` (rule 19: not by the words, they get renamed) */
  const has = async (...ids) => {
    const out = [];
    for (const id of ids) out.push((await sheet().getByTestId(`fab-${id}`).count()) === 1);
    return out.every(Boolean);
  };
  const lacks = async (...ids) => {
    for (const id of ids) if ((await sheet().getByTestId(`fab-${id}`).count()) !== 0) return false;
    return true;
  };
  /** the top edge of an item: the order in the sheet */
  const topOf = async (id) => (await sheet().getByTestId(`fab-${id}`).boundingBox()).y;
  const box = async (l) => (await l.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/today");

  // the right place for the width
  h.expect((await plus().count()) === 1, `${w}: one «＋» on Главная`);
  h.expect((await vis(wide ? "fab" : "fab-header").count()) === 0, wide ? "820/1280: no floating «＋»" : "390: no «＋» in the header");
  if (!wide) {
    const b = await box(plus());
    const tabs = await box(p.getByRole("tab", { name: "Главная", exact: true }));
    h.expect(b.x + b.width > w - 40 && b.y + b.height <= tabs.y, `390: bottom-right, above the tabs (${b.x},${b.y} vs tabs ${tabs.y})`);
    h.expect(Math.round(b.height) <= 36, `visible ≤ 36 (${b.height})`);
  }
  // the «＋» of «Главная» is yellow on every width — the floating one and the header one alike (DS §5.3, audit №2, #1395)
  const yellow = await plus().evaluate((el) => {
    const m = getComputedStyle(el.querySelector("div") ?? el).backgroundColor.match(/\d+/g) ?? [];
    const pick = (e) => getComputedStyle(e).backgroundColor;
    // the press's own box or its painted child: the one that is not transparent
    const bg = [el, ...el.querySelectorAll("div")].map(pick).find((x) => x && x !== "rgba(0, 0, 0, 0)" && x !== "transparent") ?? "";
    const [r, g, bl] = (bg.match(/\d+/g) ?? m).map(Number);
    return r > 200 && g > 200 && bl < 120;
  });
  h.expect(yellow, `${w}: the «＋» of «Главная» is yellow`);
  if (wide) {
    // the side menu's «＋ Создать» is on every screen: neutral, so «Главная» has one yellow (DS §3.1 п.3, §5.3, #1395)
    const menuYellow = await p.getByTestId("side-nav").getByRole("button", { name: "Создать", exact: true }).evaluate((el) =>
      [el, ...el.querySelectorAll("div")].map((e) => getComputedStyle(e).backgroundColor).some((bg) => {
        const [r, g, b] = (bg.match(/\d+/g) ?? []).map(Number);
        return r > 200 && g > 200 && b < 120;
      }),
    );
    h.expect(!menuYellow, `${w}: «Создать» in the side menu is not yellow`);
  }

  // Главная: only what works
  await plus().click();
  let body = await sheetText();
  h.expect(await has("lead", "client", "estimate", "job", "expense"), "Главная «＋»: lead, client, estimate, job, expense");
  h.expect(await lacks("photo", "task"), "Главная «＋» has no photo and no task yet");
  await h.shot("home-sheet");
  await sheet().getByTestId("fab-client").click();
  await p.waitForTimeout(700);
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
  h.expect((await bell.count()) === 1, "the bell on Главная");
  h.expect(/Уведомления: новых \d+/.test((await bell.getAttribute("aria-label")) ?? ""), "the bell says how many are new");
  h.expect((await vis("home-bell-count").count()) === 1, "the count on the bell");
  h.expect((await vis("home-profile").count()) === (wide ? 0 : 1), wide ? "820/1280: the profile is in the side menu" : "390: the profile on the right");
  await bell.click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/notifications", `bell → /notifications (${p.url()})`);
  await h.expectText(/Уведомления/, "the notifications screen");
  await h.expectText(/Bell Client/, "the injected notice is listed");
  await h.shot("notifications");
  await p.locator('[data-testid="notice-card"]:visible').filter({ hasText: "Bell Client" }).first().click();
  await p.waitForTimeout(700);
  h.expect(path(h) === `/estimate/${est.id}`, `the card opens its estimate (${p.url()})`);

  // Clients: one item — straight to the new client form
  await h.go("/clients");
  h.expect((await plus().count()) === 1, "Clients: one «＋» (its only item goes straight to the form)");
  await plus().click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/client/edit", `Clients «＋» → /client/edit (${p.url()})`);

  // Client (#1094): the card's main action is a visible verb «Создать смету»; the «＋» offers the estimate first,
  // then «Работа без сметы», each with one line saying what it makes
  await h.go("/client/c1");
  const mainBtn = p.getByTestId("client-make-estimate").locator("visible=true");
  h.expect((await mainBtn.count()) === 1, "client card: one visible «Создать смету» button");
  await mainBtn.first().click();
  await p.waitForURL(/\/estimate\/new/, { timeout: 5000 });
  h.expect(path(h) === "/estimate/new" && new URL(p.url()).searchParams.get("customerId") === "c1", `client card «Создать смету» → estimate for c1 (${p.url()})`);
  // no «＋» on the client card (prototype v6, founder 14.11, #1343): «Работа без сметы» is «＋» on the «Работы» tab
  await h.go("/client/c1");
  await p.getByTestId("client-tabs").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible').count()) === 0, "client card: no «＋»");
  const jobsTab = p.getByTestId("client-tabs-jobs").locator("visible=true").first();
  await jobsTab.scrollIntoViewIfNeeded();
  await jobsTab.click();
  await p.getByTestId("client-new-job").locator("visible=true").first().getByRole("button").click();
  await p.waitForURL(/\/job\/new/, { timeout: 5000 });
  h.expect(new URL(p.url()).searchParams.get("customerId") === "c1", `«Работы» → «Работа без сметы» for c1 (${p.url()})`);

  // Job: «Запланировать работу» for this job and «Смета»
  await h.go("/job/j1");
  await plus().click();
  body = await sheetText();
  h.expect(await has("visit", "estimate"), "job «＋»: visit and estimate");
  await sheet().getByTestId("fab-visit").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/job/schedule" && new URL(p.url()).searchParams.get("jobId") === "j1", `job «＋» → schedule j1 (${p.url()})`);

  // Plan: planners — Лид · Записать в план (the Plan's own sheet)
  await h.go("/plan");
  await plus().click();
  body = await sheetText();
  h.expect(await has("lead", "planAdd"), "Plan «＋»: lead and «Записать в план»");
  h.expect(await has("job", "planEvent", "planTimeOff"), "Plan «＋»: job, event, day off");
  await sheet().getByTestId("fab-planAdd").click();
  await p.waitForTimeout(600);
  await h.expectText(/Осмотр|осмотр/, "«Записать в план» opens the Plan's sheet");
  await closeSheet();
  // «Событие» and «Выходной» open the Plan's event sheet straight away (wave 5, #187/#188)
  for (const [id, text] of [["fab-planEvent", /Целый день|Весь день/], ["fab-planTimeOff", /Целый день|Весь день/]]) {
    await plus().click();
    await sheetText();
    await sheet().getByTestId(id).click();
    await p.waitForTimeout(600);
    await h.expectText(text, `${id} opens the event sheet`);
    await closeSheet();
  }

  // the technician: no «＋» on Plan and Clients; Главная — Лид · Расход; his visit — Фото · Лид · Расход
  await setRole(h, "tech");
  await h.go("/plan");
  h.expect((await vis("fab").count()) + (await vis("fab-header").count()) === 0, "tech: no «＋» on Plan (the office plans)");
  await h.go("/clients");
  h.expect((await vis("fab").count()) + (await vis("fab-header").count()) === 0, "tech: no «＋» on Clients");
  await h.go("/visits");
  h.expect((await vis("home-bell").count()) === 0, "tech: no bell (client and money notices are the office's)");
  await plus().click();
  body = await sheetText();
  h.expect((await has("lead", "expense")) && (await lacks("client", "estimate", "job")), "tech Главная «＋»: Лид · Расход");
  await closeSheet();
  const tdb = await h.db();
  const mine = tdb.visits.find((v) => v.kind !== "inspection" && ((v.assigneeIds ?? []).includes(tdb.me) || v.techId === tdb.me));
  if (mine) {
    await h.go(`/visit/${mine.id}`);
    await plus().click();
    body = await sheetText();
    h.expect(await has("photo", "lead", "expense"), "tech visit «＋»: Фото · Лид · Расход");
    await h.shot("visit-sheet");
    await closeSheet();
  }

  // no horizontal scroll with the «＋»
  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${w}`);
  await setRole(h, "director");
};
