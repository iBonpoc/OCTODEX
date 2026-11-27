const { objSection } = require("../objectScreen.cjs");
/**
 * e2e 3068 — the client's «Объекты» (#3068, founder 27.11: «заходить в объекты и видеть объект 1, объект 2… адрес, по нему какие-то
 * комментарии, доступы на объекте, имена, работы… адрес для счетов тоже туда же»; #3075 the person on site one tap away). Every view.
 * A) the overview has no «Важно знать» any more; «Впереди» is its first group;
 * B) Daniel Whitaker (c8, two places): «Home» — the address, the gate code with «Доступ · …», the note of the place («Заметка · …»),
 *    its jobs; «Rental» — its person with «Позвонить» and «SMS»; «Адрес для счетов» and «Добавить объект» below;
 * C) a person on site with no phone: no call, no SMS on the row;
 * D) a client with ONE place still has «Объекты» (its gate code would be nowhere else).
 * Finds things by testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (id) => p.getByTestId(id).locator("visible=true").count();
  const S = "client-screen";

  // A) the overview
  await h.go("/client/c8");
  await tid("client-ahead").waitFor({ timeout: 8000 });
  h.expect((await count("client-top-group")) === 0, "no «Важно знать» on the overview");
  h.expect((await count("client-access")) === 0, "no gate code on the overview");

  // B) «Объекты»
  await objSection(p, S, "places");
  await tid("client-places").waitFor({ timeout: 5000 });
  const home = tid("client-property-p8");
  await home.waitFor({ timeout: 5000 });
  const homeText = await home.innerText();
  h.expect(/Home/.test(homeText), `the place is titled by its label (${homeText.slice(0, 80)})`);
  h.expect(!/Объект 1/.test(homeText), "no number beside a label");
  h.expect(/Код ворот 1975/.test(await tid("client-property-gate-p8").innerText()), "the office sees the gate code on its place");
  h.expect(/Доступ ·/.test(await tid("client-property-gate-p8").innerText()), "the way in says its kind");
  h.expect(/Заметка ·/.test(await tid("client-property-note-n5").innerText()), "the place's note is on its card, its kind said");
  h.expect((await p.locator('[data-testid^="client-property-job-"]').locator("visible=true").count()) >= 2, "the jobs of the places are rows");
  await tid("client-property-person-pp-c8-3").waitFor({ timeout: 5000 });
  h.expect((await count("client-property-call-pp-c8-3")) === 1, "a person with a phone — «Позвонить» on the row (#3075)");
  h.expect((await count("client-property-sms-pp-c8-3")) === 1, "a mobile — «SMS» on the row (#3075)");
  h.expect(/PO Box 4410/.test(await tid("client-billing").innerText()), "the billing address is in «Объекты»");
  h.expect((await count("client-add-property")) === 1, "«Добавить объект» for the office");
  await h.shot("places");

  // C) the same person without a phone: no actions (the state is put for the next load, h.seed — CHECKS §9 №10)
  const state = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  state.db.customers = state.db.customers.map((c) => (c.id === "c8" ? { ...c, people: (c.people ?? []).map((x) => (x.id === "pp-c8-3" ? { ...x, phones: [] } : x)) } : c));
  await h.seed(DB_KEY, state);
  await h.go("/client/c8?tab=places");
  await tid("client-property-person-pp-c8-3").waitFor({ timeout: 8000 });
  h.expect((await count("client-property-call-pp-c8-3")) === 0, "no phone — no «Позвонить»");
  h.expect((await count("client-property-sms-pp-c8-3")) === 0, "no phone — no «SMS»");

  // D) a client with exactly one place keeps «Объекты»
  const db = await h.db();
  const one = db.customers.find((c) => db.properties.filter((x) => x.customerId === c.id).length === 1 && !c.archivedAt);
  h.expect(!!one, "the demo has a client with one place");
  await h.go(`/client/${one.id}`);
  await tid(`${S}-sections-places`).waitFor({ timeout: 8000 });
};
