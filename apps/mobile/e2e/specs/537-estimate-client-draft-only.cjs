/**
 * e2e 537 — #2406 (+#2383): the client of an estimate is changed only in a draft («Если не черновик — так не должно работать»).
 * С1 ДАНО черновик с клиентом; КОГДА нажать карточку клиента; ТОГДА открывается выбор клиента.
 * С2 ДАНО отправленная смета (e6); КОГДА нажать карточку клиента; ТОГДА выбор не открывается, клиент прежний.
 * Every view; found by testID (rule 19); seeded from a page without the app (h.seed).
 */
const { settle } = require("../settle.cjs");
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.estimates?.length, KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const sent = raw.db.estimates.find((e) => e.id === "e6");
  raw.db.estimates = [...raw.db.estimates.filter((e) => e.id !== "e537"), { ...sent, id: "e537", number: "EST-0537", status: "draft", sentAt: undefined, leadId: undefined, title: "Draft 537" }];
  await h.seed(KEY, raw);
  const card = () => p.getByTestId("est-client-card").locator("visible=true").first();
  const picks = () => p.locator('[data-testid^="est-client-pick-"]').locator("visible=true").count();
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await settle(p, { quietMs: 100, maxMs: 1000 }); v = await ok(); }
    h.expect(!!v, what);
  };

  await h.go("/estimate/new?id=e537");
  await card().waitFor({ timeout: 8000 });
  await card().click();
  await waitFor(async () => (await picks()) > 0, "a draft: the client picker opens");
  await h.shot("draft-picker");

  await h.go("/estimate/new?id=e6");
  await card().waitFor({ timeout: 8000 });
  const name = await card().innerText();
  await card().click({ force: true });
  await settle(p, { quietMs: 400, maxMs: 3000 }); // the page went quiet: a picker would be open by now
  h.expect((await picks()) === 0, "a sent estimate: the client picker does not open");
  h.expect((await card().innerText()) === name, "a sent estimate: the client is the same");
  await h.shot("sent-locked");
};
