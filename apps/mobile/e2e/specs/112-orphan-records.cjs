/**
 * A lead and a task of a person who is not at work any more (docs/specs/22 §2, story map S22c; unit attentionOrphans).
 * Demo mode: the spec plants a deleted person (as e2e 98) with a quiet open lead and an open task on a client.
 * - «Требует внимания» (director): «<лид>: ответственный не работает — передайте лид» with «Передать», and
 *   «Задача без исполнителя: <название>» that opens the task's client (never the general list);
 * - the card (or «Передать» on the top card) → the lead → «Кто ведёт» → me: the card is gone;
 * - the task's sheet: the gone person is not chosen and «Сохранить» waits for a choice → me → the card is gone.
 */
const LEAD = "E2E Orphan Lead";
const TASK = "E2E orphan task";
const path = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  const db0 = await h.db();
  const me = db0.members.find((m) => m.id === db0.me);
  const client = db0.customers[0];
  await p.evaluate(({ LEAD, TASK, clientId }) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const base = raw.db.leads[0];
    raw.db.members = [...raw.db.members.filter((m) => m.id !== "m-gone"), { id: "m-gone", name: "", initials: "—", kind: "employee", roles: ["sales"], pending: true, deleted: true }];
    const sent = new Date(Date.now() - 3 * 86400000).toISOString();
    raw.db.leads = [{ ...base, id: "e2e-orph", name: LEAD, status: "replied", assigneeId: "m-gone", customerId: undefined, receivedAt: sent, firstResponseAt: sent,
      lastInboundAt: undefined, lastOutboundAt: sent, lastActivityAt: sent, snoozedUntil: undefined, archivedAt: undefined, people: undefined }, ...raw.db.leads.filter((l) => l.id !== "e2e-orph")];
    raw.db.tasks = [{ id: "e2e-torph", subjectType: "customer", subjectId: clientId, title: TASK, assigneeId: "m-gone" }, ...raw.db.tasks.filter((x) => x.id !== "e2e-torph")];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, { LEAD, TASK, clientId: client.id });

  await h.go("/triage");
  await h.expectText(new RegExp(`${LEAD}: ответственный не работает — передайте лид`), "the lead of the gone person is a card");
  await h.expectText(new RegExp(`Задача без исполнителя: ${TASK}`), "the task of the gone person is a card");
  await h.shot("triage");

  // the task's card opens its client
  await p.getByText(`Задача без исполнителя: ${TASK}`).locator("visible=true").first().click(); await p.waitForTimeout(700);
  h.expect(path(h) === `/client/${client.id}`, `the task opens its client (${p.url()})`);

  // the lead's card (or «Передать» when it is the one on top) → the lead → «Кто ведёт» → me
  await h.go("/triage");
  await p.getByText(new RegExp(`${LEAD}: ответственный не работает`)).locator("visible=true").first().click(); await p.waitForTimeout(700);
  h.expect(path(h) === "/lead/e2e-orph", `the card opens the lead (${p.url()})`);
  await p.getByText("Кто ведёт", { exact: true }).locator("visible=true").first().click(); await p.waitForTimeout(500);
  await h.sheet().getByText(me.name, { exact: true }).first().click(); await p.waitForTimeout(500);
  let db = await h.db();
  h.expect(db.leads.find((l) => l.id === "e2e-orph").assigneeId === me.id, "the lead is mine now");

  // the task: the gone person is not chosen, «Сохранить» waits for a choice
  await h.go("/tasks");
  await p.getByTestId("task-e2e-torph").locator("visible=true").first().click(); await p.waitForTimeout(500);
  const sheet = h.sheet();
  const save = sheet.getByRole("button", { name: "Сохранить", exact: true }).last();
  h.expect((await save.isDisabled()) === true, "no save while nobody is chosen");
  await sheet.getByRole("radio", { name: me.name }).click(); await p.waitForTimeout(300);
  await save.click(); await p.waitForTimeout(700);
  db = await h.db();
  h.expect(db.tasks.find((x) => x.id === "e2e-torph").assigneeId === me.id, "the task is mine now");

  await h.go("/triage");
  const text = await h.text();
  h.expect(!text.includes("ответственный не работает"), "the lead's card is gone");
  h.expect(!text.includes(`Задача без исполнителя: ${TASK}`), "the task's card is gone");
};
