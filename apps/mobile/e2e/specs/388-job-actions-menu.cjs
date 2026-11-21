/**
 * e2e 388 — the job's card: one next step and «⋯» instead of a row of five pills (#1474, as the estimate #1412, the invoice and
 * the receipt; DS §7.3, Б4, §12.3), as the director, every view, by testID. Prototype v2 (#2350, the Object template):
 * - a job with an open visit of mine: «Начать выезд» is the one main step of the «Сейчас» card above the sections' line, «В пути»
 *   beside it (the second step); «Оплата», «Файл», «Завершить» are not on the page — they are in «⋯», as verbs, with the job's number
 *   first and «Отменить работу…» red and last;
 * - «⋯» is the last on the right of the header (DS §12.2: «＋» · «⋯»); «＋» makes what is made from the job («Создать смету»);
 * - the head: Позвонить · SMS · Маршрут · Фото are icons in one row (`job-screen-actions`), each a 44 tap zone;
 * - «Заметки» holds the note field (v2: «Добавить заметку…» left «⋯» — the section is one tap on the line);
 * - the technician keeps «В пути» in sight beside the main step and not in «⋯»;
 * - a job with no open visit and an owed invoice: the main step is «Принять оплату», it opens that invoice, and «⋯» has no second «Оплата».
 */
const { pressEscUntilClosed } = require("../sheet.cjs");
const { objSection } = require("../objectScreen.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const menuOrder = () =>
    p.evaluate(() =>
      [...document.querySelectorAll('[data-testid="menu-items"] [data-testid^="job-act-"]')]
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ id: e.getAttribute("data-testid"), y: e.getBoundingClientRect().y }))
        .sort((a, b) => a.y - b.y)
        .map((x) => x.id),
    );
  const openMenu = async (id = "job-screen-more") => {
    await tid(id).getByRole("button").first().click();
    await tid("menu-items").waitFor({ timeout: 3000 });
  };
  const closeMenu = () => pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());

  // 1) j1: a client with a phone, an address and an open visit
  await h.go("/job/j1");
  await tid("job-next-start").waitFor({ timeout: 8000 });
  h.expect((await tid("job-next-start").innerText()).includes("Начать выезд"), "the main step of a job with an open visit is «Начать выезд»");
  h.expect((await p.getByTestId("job-next-start").locator("visible=true").count()) === 1, "one main step");
  // above the tabs: the same step on every tab
  const tabs = await tid("job-screen-sections-overview").boundingBox();
  const main = await tid("job-next-start").boundingBox();
  h.expect(tabs && main.y < tabs.y, "the main step stands above the sections' line");
  // «В пути» — the second step beside it
  const enroute = await tid("job-next-enroute").boundingBox();
  h.expect(enroute && Math.abs(enroute.y + enroute.height / 2 - (main.y + main.height / 2)) <= 4 && enroute.x > main.x, "«В пути» stands beside the main step");
  const more = await tid("job-screen-more").boundingBox();
  const create = await tid("job-screen-create").boundingBox();
  h.expect(more && create && more.x > create.x, "«⋯» is the last on the right of the header, after «＋»");
  for (const id of ["job-act-pay", "job-act-file", "job-act-complete"]) h.expect((await p.getByTestId(id).locator("visible=true").count()) === 0, `«${id}» is not on the page (it lives in «⋯»)`);

  // the head: Позвонить · SMS · Маршрут · Фото — icons in one row
  const tiles = [];
  for (const id of ["job-call", "job-write", "job-route", "job-photo"]) {
    h.expect((await tid("job-screen-actions").getByTestId(id).count()) === 1, `«${id}» is in the row of icons`);
    tiles.push(await tid(id).boundingBox());
  }
  h.expect(tiles.every(Boolean), "Позвонить · SMS · Маршрут · Фото are there");
  h.expect(tiles.every((b) => Math.abs(b.y - tiles[0].y) <= 2) && tiles.every((b, i) => i === 0 || b.x > tiles[i - 1].x), "they stand in one row");
  h.expect(tiles.every((b) => b.height >= 44), "each icon is a 44 tap zone");
  await h.shot("card");

  // «⋯»: the number · В пути · Оплата (when there is money to take) · Завершить · Файл; then «Отменить работу…» (#2015, red, last)
  await openMenu();
  const order = await menuOrder();
  const want = ["job-act-number", "job-act-enRoute", ...(order.includes("job-act-pay") ? ["job-act-pay"] : []), "job-act-complete", "job-act-file", "job-act-cancel"];
  h.expect(JSON.stringify(order) === JSON.stringify(want), `the menu: ${order.join(", ")}`);
  const words = await p.evaluate(() => [...document.querySelectorAll('[data-testid="menu-items"] [data-testid^="job-act-"]')].filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()));
  for (const w of ["Сообщить «В пути»", "Завершить работу", "Добавить фото на выезде…", "Отменить работу…"]) h.expect(words.includes(w), `a verb in «⋯»: «${w}» (${words.join(" | ")})`);
  h.expect((await p.getByTestId("menu-divider").locator("visible=true").count()) === 1, "one line, before the only dangerous item («Отменить работу…», #2015)");
  await h.shot("menu");
  await closeMenu();
  // «＋»: what is made from the job — «Создать смету» among them
  await openMenu("job-screen-create");
  h.expect((await p.getByTestId("job-create-estimate").locator("visible=true").count()) === 1, "«＋» → «Создать смету»");
  await closeMenu();
  // «Заметки» → the note field
  await objSection(p, "job-screen", "notes");
  await p.getByPlaceholder("Собака во дворе, где парковаться…").locator("visible=true").first().waitFor({ timeout: 4000 });

  // the technician: «В пути» in sight beside the main step, not in «⋯»
  await h.seed("octo.role.v1", "tech");
  await h.go("/job/j1");
  await tid("job-next-start").waitFor({ timeout: 8000 });
  await tid("job-next-enroute").waitFor({ timeout: 3000 });
  await openMenu();
  h.expect(!(await menuOrder()).includes("job-act-enRoute"), "the tech: «В пути» is not repeated in «⋯»");
  await closeMenu();
  await h.seed("octo.role.v1", "director");

  // 2) a job with no open visit and an owed invoice: «Оплата» is the main step
  await h.go("/job/j1");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const inv = raw.db.invoices.find((i) => i.jobId && i.totalCents > i.paidCents);
  h.expect(inv, "demo has an owed invoice of a job");
  const job = raw.db.jobs.find((j) => j.id === inv.jobId);
  job.status = "scheduled";
  raw.db.visits = raw.db.visits.filter((v) => v.jobId !== job.id);
  await h.seed("octo.db.v5", raw);
  await h.go(`/job/${job.id}`);
  await tid("job-next-pay").waitFor({ timeout: 8000 });
  h.expect((await tid("job-next-pay").innerText()).includes("Принять оплату"), "no open visit, money owed: the main step is «Принять оплату»");
  await openMenu();
  const order2 = await menuOrder();
  h.expect(JSON.stringify(order2) === JSON.stringify(["job-act-number", "job-act-complete", "job-act-cancel"]), `no visit: the number, «Завершить» and «Отменить работу» in «⋯», no second «Оплата» (${order2.join(", ")})`);
  await closeMenu();
  await tid("job-next-pay").click();
  await p.waitForURL((u) => u.pathname.startsWith("/invoice/"), { timeout: 5000 });
  h.expect(new URL(p.url()).pathname === `/invoice/${inv.id}`, `«Оплата» opens the owed invoice of the job (${p.url()})`);
};
