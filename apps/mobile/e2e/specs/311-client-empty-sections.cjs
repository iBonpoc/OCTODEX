/**
 * e2e 311 — an empty list of a client says what to do: the button to make the first one stands IN the empty state (S-42, #882).
 * A client with no address, no task and no estimate, every view, by testID:
 * - «Объекты»: the button in the empty state opens the address form;
 * - «Задачи»: the button opens the task form;
 * - «Сметы»: with no address the button makes the address first; with one it goes to the estimate for that address.
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
  await tid("client-empty-add-property").waitFor({ timeout: 8000 });
  await tid("client-empty-add-property").getByRole("button").click();
  await p.getByText(/Адрес|Address/).first().waitFor({ timeout: 4000 });
  await h.shot("property-form");

  await h.go(`/client/${CID}?s=tasks`);
  await tid("client-empty-add-task").waitFor({ timeout: 8000 });
  await tid("client-empty-add-task").getByRole("button").click();
  await p.locator("input").locator("visible=true").first().waitFor({ timeout: 4000 });

  // estimates: no address yet → the address first
  await h.go(`/client/${CID}?s=estimates`);
  await tid("client-empty-add-estimate").waitFor({ timeout: 8000 });
  h.expect(/Объект|Property|Propiedad|Добавить|Add/i.test(await tid("client-empty-add-estimate").innerText()), "no address: the button makes the address");
  await h.shot("estimates-empty");

  // with an address: the button goes to the estimate for it
  await h.go(`/client/${CID2}?s=estimates`);
  await tid("client-empty-add-estimate").getByRole("button").click();
  await p.waitForURL((u) => /\/estimate\/new/.test(u.pathname) && /propertyId=p-e2e-311b/.test(u.search), { timeout: 8000 });
};
