/**
 * e2e 388 — the job's card: one next step and «⋯» instead of a row of five pills (#1474, as the estimate #1412, the invoice and
 * the receipt; DS §7.3, Б4, §12.3), as the director, every view, by testID:
 * - a job with an open visit: «Начать выезд» is the one main button above the tabs (full width on a phone, as wide as its
 *   words from 820); «В пути», «Оплата», «Заметка», «Файл» are not on the page — they are in «⋯», in that order, as verbs;
 * - «⋯» is the last on the right of the header (DS §12.2: «＋» · «⋯»);
 * - Позвонить · Написать · Маршрут are round tiles in one line inside the job's card (as on the client's card);
 * - «Добавить заметку…» opens «История» with the cursor in the note field;
 * - the technician keeps «Сообщить «В пути»» in sight beside the main step (and not in «⋯»);
 * - a job with no open visit and an owed invoice: the main step is «Принять оплату», it opens that invoice, and «⋯» has no second «Оплата».
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const phone = h.layout.width < 820;
  const menuOrder = () =>
    p.evaluate(() =>
      [...document.querySelectorAll('[data-testid^="job-act-"]')]
        .filter((e) => e.offsetParent !== null)
        .map((e) => ({ id: e.getAttribute("data-testid"), y: e.getBoundingClientRect().y }))
        .sort((a, b) => a.y - b.y)
        .map((x) => x.id),
    );
  const openMenu = async () => {
    await tid("job-more").getByRole("button").click();
    await tid("menu-items").waitFor({ timeout: 3000 });
  };

  // 1) j1: a client with a phone, an address and an open visit
  await h.go("/job/j1");
  await tid("job-main").waitFor({ timeout: 8000 });
  h.expect((await tid("job-main").innerText()).includes("Начать выезд"), "the main step of a job with an open visit is «Начать выезд»");
  // above the tabs: the same step on every tab
  const tabs = await tid("job-tab-details").boundingBox();
  h.expect(tabs && (await tid("job-main").boundingBox()).y < tabs.y, "the main step stands above «Детали · Деньги · История»");
  h.expect((await p.getByTestId("job-enroute").locator("visible=true").count()) === 0, "the office: «В пути» is in «⋯», not beside the main step");
  if (!phone) {
    const more = await tid("job-more").boundingBox();
    const create = await p.getByRole("button", { name: "Создать" }).locator("visible=true").first().boundingBox();
    h.expect(more && create && more.x > create.x, "«⋯» is the last on the right of the header, after «＋ Создать»");
  }
  for (const word of ["В пути", "Оплата", "Заметка", "Файл"]) {
    h.expect((await p.getByRole("button", { name: word, exact: true }).locator("visible=true").count()) === 0, `«${word}» is not on the page (it lives in «⋯»)`);
  }
  const main = await tid("job-main").boundingBox();
  const vp = p.viewportSize();
  if (phone) h.expect(main && main.width > vp.width * 0.8, `on a phone the main step is full width (${main && main.width})`);
  else h.expect(main && main.width < 400, `from 820 the main step is as wide as its words (${main && main.width})`);

  // the contact tiles: one line inside the card
  const tiles = [];
  for (const id of ["job-call", "job-write", "job-route"]) tiles.push(await tid(id).boundingBox());
  h.expect(tiles.every(Boolean), "Позвонить · Написать · Маршрут are there");
  h.expect(tiles.every((b) => Math.abs(b.y - tiles[0].y) <= 2), "the three tiles stand in one line");
  h.expect(tiles.every((b) => b.height >= 44), "each tile is a 44 tap zone");
  await h.shot("card");

  // «⋯»: В пути · Оплата (when there is money to take) · Заметка · Файл; nothing dangerous, no line
  await openMenu();
  const order = await menuOrder();
  const want = ["job-act-enRoute", ...(order.includes("job-act-pay") ? ["job-act-pay"] : []), "job-act-note", "job-act-file"];
  h.expect(JSON.stringify(order) === JSON.stringify(want), `the menu: ${order.join(", ")}`);
  const words = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="job-act-"]')].filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()));
  for (const w of ["Сообщить «В пути»", "Добавить заметку…", "Добавить фото на выезде…"]) h.expect(words.includes(w), `a verb in «⋯»: «${w}» (${words.join(" | ")})`);
  h.expect((await p.getByTestId("menu-divider").locator("visible=true").count()) === 0, "no line: nothing dangerous in this menu");
  await h.shot("menu");
  // «Заметка» → «История» with the note field
  await tid("job-act-note").click();
  await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ state: "hidden", timeout: 3000 });
  const field = p.getByPlaceholder("Собака во дворе, где парковаться…").locator("visible=true").first();
  await field.waitFor({ timeout: 4000 });
  await p.waitForFunction(() => document.activeElement && document.activeElement.getAttribute("placeholder") === "Собака во дворе, где парковаться…", null, { timeout: 3000 });

  // the technician: «В пути» in sight beside the main step, not in «⋯»
  await h.seed("octo.role.v1", "tech");
  await h.go("/job/j1");
  await tid("job-main").waitFor({ timeout: 8000 });
  await tid("job-enroute").waitFor({ timeout: 3000 });
  await openMenu();
  h.expect(!(await menuOrder()).includes("job-act-enRoute"), "the tech: «В пути» is not repeated in «⋯»");
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  await h.seed("octo.role.v1", "director");

  // 2) a job with no open visit and an owed invoice: «Оплата» is the main step
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const inv = raw.db.invoices.find((i) => i.jobId && i.totalCents > i.paidCents);
  h.expect(inv, "demo has an owed invoice of a job");
  const job = raw.db.jobs.find((j) => j.id === inv.jobId);
  job.status = "scheduled";
  raw.db.visits = raw.db.visits.filter((v) => v.jobId !== job.id);
  await h.seed("octo.db.v5", raw);
  await h.go(`/job/${job.id}`);
  await tid("job-main").waitFor({ timeout: 8000 });
  h.expect((await tid("job-main").innerText()).includes("Принять оплату"), "no open visit, money owed: the main step is «Принять оплату»");
  await openMenu();
  const order2 = await menuOrder();
  h.expect(JSON.stringify(order2) === JSON.stringify(["job-act-note"]), `no visit: only «Заметка» in «⋯», no second «Оплата» (${order2.join(", ")})`);
  await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
  await tid("job-main").getByRole("button").click();
  await p.waitForURL((u) => u.pathname.startsWith("/invoice/"), { timeout: 5000 });
  h.expect(new URL(p.url()).pathname.startsWith("/invoice/"), `«Оплата» opens an invoice of the job (${p.url()})`);
};
