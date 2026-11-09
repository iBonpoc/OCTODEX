/**
 * e2e 217 — «Замер желобов» из карточки клиента и замер лида на адресе (основатель 09.11, #697 #704;
 * docs/specs/33-gutters-workflow.md П24 А3, Б4; стык S4g). Every view.
 * - the module on: a client with one address → «Замер желобов» on the card → the canvas of that address;
 * - a client with several addresses → the start screen asks which → a card → the canvas of that address;
 * (S4h — a lead's measurement on its address — is unit:gutterLink: the e2e would have to edit the app's own storage.)
 * Finds things by testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const qp = (k) => new URL(p.url()).searchParams.get(k);

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => (await tid("module-gutters-status").count()) === 1, "the module is on");
  const d0 = await db();
  const byCount = (n) => d0.customers.find((c) => d0.properties.filter((q) => q.customerId === c.id).length === n);
  const one = byCount(1);
  h.expect(!!one, "the demo has a client with one address");
  const place = d0.properties.find((q) => q.customerId === one.id);

  // one address → straight to its canvas
  await h.go(`/client/${one.id}`);
  await tid("module-gutters-measure").waitFor({ timeout: 8000 });
  h.expect(/^Замер желобов$/.test((await tid("module-gutters-measure").innerText()).trim()), "the client's card: «Замер желобов»");
  await h.shot("client");
  await tid("module-gutters-measure").getByRole("button").click();
  await waitFor(() => /\/module\/gutters\/draw/.test(p.url()) && qp("property") === place.id, `the canvas of the client's address (${p.url()})`);

  // several addresses → the start screen asks which
  const many = d0.customers.find((c) => d0.properties.filter((q) => q.customerId === c.id).length >= 2);
  if (many) {
    const second = d0.properties.filter((q) => q.customerId === many.id)[1];
    await h.go(`/client/${many.id}`);
    await tid("module-gutters-measure").getByRole("button").click();
    await tid(`start-place-${second.id}`).waitFor({ timeout: 8000 });
    await h.shot("pick");
    await tid(`start-place-${second.id}`).click();
    await waitFor(() => /\/module\/gutters\/draw/.test(p.url()) && qp("property") === second.id, "the canvas of the address picked");
  }
};
