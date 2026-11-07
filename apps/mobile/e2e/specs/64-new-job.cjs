/**
 * Wave 3b «Новая работа» (S17; docs/specs/17-job.md §7.3, 13 §3.5, 15-flows §1.2):
 * - office: a client from the list → its address → name, type → a date and a person → «Создать работу» → «Сообщить
 *   клиенту?» → the job «JOB-…» with its visit → on the Plan that day;
 * - office: a new client in the same form → «Назначить позже» → the job waits for a date, the client is active;
 * - sales: no date block, the job waits for a date; a «do not service» client is not offered.
 */
const { minuteOf, workdayOffset } = require("../companyTime.cjs");
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  let db = await h.db();
  const client = db.customers.find((c) => c.id === "c3");
  const banned = db.customers.find((c) => c.id === "c4");
  await p.evaluate((id) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.customers = raw.db.customers.map((c) => (c.id === id ? { ...c, status: "do_not_service", statusReason: "e2e" } : c));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, banned.id);
  await setRole(h, "director");

  // 1. an existing client, with a date
  await h.go("/job/new");
  await h.expectText(/Новая работа/, "the form is open");
  await h.click("Выбрать клиента");
  await h.sheet().getByPlaceholder("Имя, телефон или адрес").fill(banned.name);
  await p.waitForTimeout(300);
  h.expect((await h.sheet().getByRole("button", { name: banned.name }).count()) === 0, "a «do not service» client is not offered");
  await h.sheet().getByPlaceholder("Имя, телефон или адрес").fill(client.name);
  await h.sheet().getByRole("button", { name: client.name }).first().click();
  await p.waitForTimeout(400);
  await p.getByTestId("job-new-title").locator("visible=true").locator("input").last().fill("Downspout reattach");
  await p.getByRole("radio", { name: "Ремонт", exact: true }).last().click();
  await p.getByRole("tab", { name: "Дата и время", exact: true }).last().click();
  const dayOffset = workdayOffset(3);
  await p.getByRole("radiogroup").filter({ has: p.getByRole("radio", { name: "Сегодня" }) }).first().getByRole("radio").nth(dayOffset).click();
  await p.getByRole("button", { name: "Ivan Sokolov" }).last().click();
  await p.getByRole("radio", { name: /^1:00/ }).last().click();
  await h.shot("filled");
  await h.click("Создать работу");
  await p.waitForTimeout(600);
  await h.expectText(/Сообщить клиенту\?/, "«Сообщить клиенту?» after a dated job");
  await h.sheet().getByRole("button", { name: "Не сейчас" }).click();
  await p.waitForTimeout(700);
  db = await h.db();
  const job = db.jobs.find((j) => j.title === "Downspout reattach");
  h.expect(job && job.customerId === client.id && job.status === "scheduled" && /^JOB-\d{4}$/.test(job.number || ""), `job made: ${JSON.stringify(job)}`);
  h.expect(db.jobTypes.find((x) => x.id === job.jobTypeId)?.seedKey === "repair", "type saved");
  const v = db.visits.find((x) => x.jobId === job.id);
  h.expect(v && v.techId === "m-ivan" && minuteOf(v.start) === 13 * 60, `its visit, 1:00 PM of the company: ${v && v.start}`);
  h.expect(path(h) === `/job/${job.id}`, `opens the new job (${p.url()})`);
  await h.expectText(new RegExp(`Работа ${job.number}`), "the job's header");
  await h.go("/plan");
  for (let i = 0; i < dayOffset; i++) await p.getByRole("button", { name: "Вперёд" }).last().click();
  await p.waitForTimeout(400);
  await h.expectText(/Downspout reattach/, "on the Plan that day");

  // 2. a new client from the form, «Назначить позже»
  await h.go("/job/new");
  await h.click("Новый клиент");
  await p.getByPlaceholder("Имя", { exact: false }).first().fill("Nora Quinn");
  await p.getByPlaceholder("(555) 555-0100").last().fill("(555) 555-0164");
  await p.getByPlaceholder("Улица, дом, офис").last().fill("64 Birch Ln");
  await p.getByPlaceholder("Pasadena, CA 91103").last().fill("Pasadena, CA 91104");
  await p.getByTestId("job-new-title").locator("visible=true").locator("input").last().fill("Fascia patch");
  // a double tap makes one client and one job
  await p.getByRole("button", { name: "Создать работу", exact: true }).last().dblclick();
  await p.waitForTimeout(700);
  db = await h.db();
  const nora = db.customers.find((c) => c.name === "Nora Quinn");
  const j2 = db.jobs.find((j) => j.title === "Fascia patch");
  h.expect(nora && nora.status === "active", "a new client from the form is active");
  h.expect(db.customers.filter((c) => c.name === "Nora Quinn").length === 1 && db.jobs.filter((j) => j.title === "Fascia patch").length === 1, "a double tap: one client, one job");
  h.expect(j2 && j2.customerId === nora.id && j2.status === "unscheduled" && !db.visits.some((x) => x.jobId === j2.id), "the job waits for a date");
  h.expect(db.properties.find((x) => x.id === j2.propertyId)?.address === "64 Birch Ln", "the address is the new client's property");

  // 3. sales: no date
  await setRole(h, "sales");
  await h.go("/job/new");
  h.expect((await p.getByRole("tab", { name: "Дата и время", exact: true }).count()) === 0, "sales: no date block");
  await h.expectText(/Дату и мастеров назначит офис/, "sales: why there is no date");
  await h.click("Выбрать клиента");
  await h.sheet().getByPlaceholder("Имя, телефон или адрес").fill(client.name);
  await h.sheet().getByRole("button", { name: client.name }).first().click();
  await p.waitForTimeout(400);
  await p.getByTestId("job-new-title").locator("visible=true").locator("input").last().fill("Sales job");
  await h.click("Создать работу");
  await p.waitForTimeout(600);
  db = await h.db();
  h.expect(db.jobs.find((j) => j.title === "Sales job")?.status === "unscheduled", "sales: the job waits for a date");
};
