const { listSearch, listSearchClear } = require("../listSearch.cjs");
const { objSection } = require("../objectScreen.cjs");
/**
 * People of a lead (wave L2 part 2, docs/14-leads-spec.md §2, Р12): a second phone for the lead itself and a spouse with
 * their own phone, saved in one sheet; then the estimate makes the client (S3) and the people are the client's.
 * v2 (#2350): the lead's «Контакт» group (`lead-contact`: `lead-person-main`, `lead-person-<id>`, «Добавить человека» `lead-add-person`).
 */
exports.run = async (h) => {
  const p = h.page;
  const lead = async (name) => (await h.db()).leads.find((x) => x.name === name);

  await h.go("/inbox?tab=leads");
  let tom = await lead("Tom Becker");
  await h.go(`/lead/${tom.id}`);
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const contact = () => tid("lead-contact").innerText();
  h.expect(/\(626\) 555-0108/.test(await tid("lead-person-main").innerText()), "main phone on the card");
  h.expect((await p.locator('[data-testid^="lead-person-"]').locator("visible=true").count()) === 1, "no other people yet");

  // one sheet: + phone for Tom, + spouse Ann with her phone
  await tid("lead-add-person").click();
  await h.sheet().getByTestId("people-0-phones-add").click();
  await h.sheet().getByPlaceholder("Телефон", { exact: true }).nth(1).pressSequentially("6265550199");
  await h.sheet().getByRole("button", { name: /Добавить контакт/ }).click();
  await h.sheet().getByPlaceholder("Имя", { exact: true }).last().fill("Ann Becker");
  await h.sheet().getByPlaceholder("Телефон", { exact: true }).nth(2).pressSequentially("6265550177");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.leads.find((x) => x.name === "Tom Becker")?.people?.length === 2, null, { timeout: 5000 });
  tom = await lead("Tom Becker");
  h.expect(tom.people && tom.people.length === 2, `two people: ${JSON.stringify(tom.people)}`);
  h.expect(tom.people[0].name === "Tom Becker" && tom.people[0].phones.map((x) => x.number).join() === "(626) 555-0108,(626) 555-0199", "Tom has two phones");
  h.expect(tom.phone === "(626) 555-0108", "the lead keeps the main phone for search");
  h.expect(tom.people[1].name === "Ann Becker" && tom.people[1].role === "spouse" && tom.people[1].phones[0].number === "(626) 555-0177", "spouse with her phone");
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="lead-contact"]')].some((e) => e.offsetParent !== null && /Ann Becker/.test(e.innerText)), null, { timeout: 5000 });
  h.expect(/\(626\) 555-0199/.test(await contact()), "second phone on the card");
  h.expect(/Ann Becker/.test(await contact()), "spouse on the card");

  // the spouse's phone finds this lead from the inbox search
  await h.go("/inbox?tab=leads");
  await listSearch(p, "5550177");
  await tid(`lead-row-${tom.id}`).waitFor({ timeout: 5000 });
  h.expect((await p.locator('[data-testid^="lead-row-l"]:not([data-testid*="-tel-"]):not([data-testid*="-sms-"])').locator("visible=true").count()) === 1, "search by the spouse's phone: only Tom");
  await listSearchClear(p);

  // estimate → prospect client: the people go with the lead (S3)
  await h.go(`/lead/${tom.id}`);
  await objSection(p, "lead-screen", "estimates");
  await tid("lead-new-estimate").click();
  await p.waitForURL(/\/estimate\/new/, { timeout: 8000 });
  await p.waitForFunction((id) => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.leads.find((x) => x.id === id)?.customerId, tom.id, { timeout: 5000 });
  const db = await h.db();
  tom = db.leads.find((x) => x.id === tom.id);
  const client = db.customers.find((c) => c.id === tom.customerId);
  h.expect(!!client && client.people && client.people.map((x) => x.name).join() === "Tom Becker,Ann Becker", "client has the lead's people");
  h.expect(client.people[0].phones.length === 2, "and both of Tom's phones");
  await h.go(`/client/${client.id}`);
  // «Контакты · 2» in the client's header panel (v2): Tom and Ann
  await p.getByTestId("client-people").first().waitFor({ state: "attached", timeout: 8000 });
  h.expect(/Контакты · 2[\s\S]*Ann Becker/.test(await p.getByTestId("client-people").first().innerText()), "spouse among the client's contacts");
  await h.go(`/lead/${tom.id}`);
  h.expect(/Контакты клиента/.test(await tid("lead-person-main").innerText()), "the lead card shows the client's people");
  await h.shot("lead-people");
};
