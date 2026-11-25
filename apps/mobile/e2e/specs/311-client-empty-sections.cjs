const { objCreate, objSection } = require("../objectScreen.cjs");
/**
 * e2e 311 — an empty client says what to do (S-42, #882), v2 (#2350, the Object template): a client with no address, no task and
 * no estimate, every view, by testID:
 * - «＋ → Объект» opens the address form (the section «Объекты» is drawn from two addresses on, v2 — nextStep.clientSectionKeys);
 * - «＋ → Новая задача» opens the task form;
 * - «Сметы»: the empty state; the one main step «Новая смета» in «Сейчас» opens the estimate for the client — with an address,
 *   the estimate is for that address.
 */
const DB_KEY = "octo.db.v5";
const CID = "c-e2e-311";
const CID2 = "c-e2e-311b";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/today");
  const s = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  const base = s.db.customers[0];
  s.db.customers.push({ ...base, id: CID, name: "Empty Client E2E", people: undefined, phone: undefined, email: undefined, mergedInto: undefined, archivedAt: undefined });
  // a second client with an address and no estimate
  s.db.customers.push({ ...s.db.customers[0], id: CID2, name: "Address Client E2E", people: undefined, phone: undefined, email: undefined, mergedInto: undefined, archivedAt: undefined });
  s.db.properties.push({ ...s.db.properties[0], id: "p-e2e-311b", customerId: CID2 });
  await h.seed(DB_KEY, s);

  await h.go(`/client/${CID}?s=properties`);
  // an old address of the properties still opens the client (on «Обзор»: no «Объекты» with no address)
  await tid("client-screen-sections-overview").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("client-screen-sections-places").count()) === 0, "no «Объекты» section with no address");
  await objCreate(p, "client-screen", "client-create-property");
  await h.sheet().getByPlaceholder("Улица и дом", { exact: true }).waitFor({ timeout: 4000 });
  await h.shot("property-form");

  await h.go(`/client/${CID}?s=tasks`);
  await objCreate(p, "client-screen", "client-create-task");
  await h.sheet().getByPlaceholder(/перезвонить/).waitFor({ timeout: 4000 });

  // estimates: the empty section, and the main step makes the first one
  await h.go(`/client/${CID}?s=estimates`);
  await tid("client-estimates").waitFor({ timeout: 8000 });
  h.expect((await p.locator('[data-testid^="client-estimate-"]').count()) === 0, "no estimates yet");
  await h.shot("estimates-empty");
  await tid("client-make-estimate").click();
  await p.waitForURL((u) => /\/estimate\/new/.test(u.pathname) && new RegExp(`customerId=${CID}\\b`).test(u.search), { timeout: 8000 });

  // with an address: the estimate is for it
  await h.go(`/client/${CID2}?s=estimates`);
  await tid("client-make-estimate").click();
  await p.waitForURL((u) => /\/estimate\/new/.test(u.pathname) && u.search.includes(`customerId=${CID2}`), { timeout: 8000 });
  const addr = s.db.properties[0].address;
  await p.getByTestId("est-client-card").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("est-client-card").locator("visible=true").first().innerText()).includes(addr), `the estimate is for the client's address (${addr})`);
};
