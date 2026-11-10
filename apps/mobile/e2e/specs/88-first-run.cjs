/**
 * Wave 7-1 — first run (docs/specs/13 §3.11, 19 §2 п.1–2; 15-flows §1.8):
 * - «Чем вы занимаетесь?» (/auth/trade): search, pick presets and «Другое» → the company's directions, then the profile wizard;
 *   «Пропустить» goes on without adding anything;
 * - «Первые шаги» on the owner's Главная: профиль компании · первая работа · пригласить команду · установить на телефон
 *   (browser); each step opens its screen, «Установить» shows how; «Скрыть» hides it for good; the office does not see it.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;
const RU = { handyman: "Хендимен", plumbing: "Сантехника", electrical: "Электрика", painting: "Покраска", cleaning: "Уборка", flooring: "Полы", roofing: "Кровля", gutters: "Водостоки", landscaping: "Ландшафт", fencing: "Заборы" };

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/today");
  await setRole(h, "director");
  // a fresh company: no jobs yet, only me, no logo
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.jobs = [];
    raw.db.members = raw.db.members.filter((m) => m.id === raw.db.me);
    raw.db.company.brand = { ...raw.db.company.brand, logo: undefined };
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.removeItem("octo.firstSteps.hidden.v1");
  });
  await h.go("/today");

  // «Первые шаги»: 4 steps, none done
  const card = () => vis("first-steps");
  await card().waitFor({ timeout: 4000 });
  for (const id of ["profile", "job", "team", "install"]) h.expect((await vis(`first-${id}`).count()) === 1, `step «${id}»`);
  const text = await card().innerText();
  for (const s of ["Профиль компании", "Первая работа", "Пригласить команду", "Установить на телефон"]) h.expect(text.includes(s), `the card has «${s}»`);
  for (const s of ["каталог", "Составьте и отправьте смету", "Импорт", "Оплаты онлайн"]) h.expect(!text.includes(s), `no «${s}» (only what works)`);
  await h.shot("first-steps");

  // each step opens its screen
  for (const [id, to] of [["job", "/job/new"], ["team", "/team"], ["profile", "/company/profile"]]) {
    await h.go("/today");
    await vis(`first-${id}`).getByRole("button", { name: "Начать" }).click();
    await p.waitForTimeout(700);
    h.expect(path(h) === to, `«${id}» → ${to} (${p.url()})`);
  }
  // «Установить на телефон»: how, in a sheet
  await h.go("/today");
  await vis("first-install").getByRole("button", { name: "Начать" }).click();
  await h.expectText(/На экран „Домой“/, "the iPhone way");
  await h.expectText(/Установить приложение/, "the Android way");
  await pressEscUntilClosed(p);

  // the office has no first steps
  await setRole(h, "dispatcher");
  await h.go("/today");
  await p.waitForTimeout(500);
  h.expect((await card().count()) === 0, "dispatcher: no «Первые шаги»");

  // «Скрыть»: gone, and stays gone
  await setRole(h, "director");
  await h.go("/today");
  await card().getByRole("button", { name: "Скрыть" }).click();
  await p.waitForTimeout(500);
  h.expect((await card().count()) === 0, "hidden");
  await h.go("/today");
  await p.waitForTimeout(600);
  h.expect((await card().count()) === 0, "still hidden after reload");

  // «Чем вы занимаетесь?»: search, a preset and «Другое»
  const db0 = await h.db();
  const active = new Set(db0.serviceCategories.filter((c) => !c.archivedAt).map((c) => c.seedKey));
  const key = Object.keys(RU).find((k) => !active.has(k));
  h.expect(!!key, "a preset the company does not have yet");
  await h.go("/auth/trade");
  await vis("trade-step").waitFor({ timeout: 3000 });
  await h.expectText(/Чем вы занимаетесь\?/, "the question");
  await p.getByPlaceholder("Найти направление").locator("visible=true").fill(RU[key].slice(1, 5).toLowerCase());
  await p.waitForTimeout(300);
  const chip = p.getByRole("checkbox", { name: RU[key], exact: true }).locator("visible=true");
  h.expect((await chip.count()) === 1, `search finds «${RU[key]}»`);
  h.expect((await p.getByRole("checkbox").locator("visible=true").count()) <= 3, "search narrows the list");
  await chip.click();
  await p.getByPlaceholder("Например, мойка под давлением").locator("visible=true").fill("Мойка фасадов");
  await h.shot("trade");
  await p.getByRole("button", { name: "Продолжить" }).locator("visible=true").click();
  await p.waitForTimeout(800);
  h.expect(path(h) === "/company/profile", `then the profile wizard (${p.url()})`);
  const db1 = await h.db();
  const cats = db1.serviceCategories.filter((c) => !c.archivedAt);
  h.expect(cats.some((c) => c.seedKey === key), `«${RU[key]}» is a direction now`);
  h.expect(cats.some((c) => c.name === "Мойка фасадов"), "«Другое» by its own name");

  // «Пропустить» adds nothing
  await h.go("/auth/trade");
  await p.getByRole("button", { name: "Пропустить, заполню позже" }).locator("visible=true").click();
  await p.waitForTimeout(700);
  h.expect(path(h) === "/company/profile", `skip → profile (${p.url()})`);
  h.expect((await h.db()).serviceCategories.length === db1.serviceCategories.length, "skip adds no direction");

  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${h.layout.width}`);
};
