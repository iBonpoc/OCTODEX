/**
 * e2e 551 — «⊕ Новый клиент» in the client sheet of a new estimate (#2887): the client is made without leaving the estimate.
 * С1 ДАНО новая смета, набрана позиция КОГДА шторка «Клиент» ТОГДА первой строкой «Новый клиент».
 * С2 КОГДА «Новый клиент» и «назад» из пустой формы ТОГДА смета та же: позиция на месте, клиент не выбран.
 * С3 КОГДА «Новый клиент», заполнена форма и «Создать» ТОГДА назад в ту же смету: новый клиент и его адрес выбраны,
 *    набранная позиция на месте; клиент есть в базе.
 * By testID (rule 19): `est-client-new`, `est-client-card`, `client-form`, `client-save`, `est-add-new`, `est-name-*`.
 */
const { pressEscUntilClosed } = require("../sheet.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const vis = (sel) => p.locator(sel).locator("visible=true");
  const path = () => new URL(p.url()).pathname;
  const onPath = async (re, what) => {
    await p.waitForFunction((src) => new RegExp(src).test(location.pathname), re.source, { timeout: 8000 });
    h.expect(re.test(path()), `${what} (${path()})`);
  };
  const field = (ph) => tid("client-form").getByPlaceholder(ph, { exact: true });

  // a new estimate opens with the client sheet: its first row is «Новый клиент» (С1)
  await h.go("/estimate/new");
  await tid("est-client-new").waitFor({ timeout: 8000 });
  h.expect(/Новый клиент/.test(await tid("est-client-new").innerText()), "С1: «Новый клиент» in the client sheet");
  await pressEscUntilClosed(p, tid("est-client-new"));

  // something typed in the estimate first: a line
  await tid("est-add-new").getByRole("button").click();
  const nameBox = vis('[data-testid^="est-name-"]').first().locator("input");
  await nameBox.waitFor({ timeout: 3000 });
  await nameBox.fill("Gutter 551");
  await vis('[data-testid^="est-price-"]').first().locator("input").fill("10");
  const typed = async () => p.evaluate(() => document.body.innerText.includes("Gutter 551") || [...document.querySelectorAll("input")].some((i) => i.value === "Gutter 551"));

  // С2: «Новый клиент» → back from the empty form: the same estimate, nothing lost, no client picked
  await tid("est-client-card").click();
  await tid("est-client-new").click();
  await tid("client-form").waitFor({ timeout: 8000 });
  await onPath(/^\/client\/edit$/, "С2: the new-client form is open");
  await p.goBack();
  await onPath(/^\/estimate\/new$/, "С2: back in the estimate");
  await tid("est-client-card").waitFor({ timeout: 8000 });
  h.expect(await typed(), "С2: the typed line is still there");
  const db0 = await h.db();
  h.expect(!db0.customers.some((c) => /Nora/.test(c.name)), "С2: no client made");

  // С3: «Новый клиент» → the form filled → «Создать»: back in the estimate with the new client picked
  await tid("est-client-card").click();
  await tid("est-client-new").click();
  await tid("client-form").waitFor({ timeout: 8000 });
  await field("Имя").fill("Nora");
  await field("Фамилия").fill("Park");
  await p.getByTestId("client-phones-row-0-value").locator("visible=true").first().locator("input").fill("(818) 555-0551");
  await field("Улица, дом, офис").fill("551 Elm St");
  await field("Pasadena, CA 91103").fill("Glendale, CA 91203");
  await tid("client-save").click();
  await onPath(/^\/estimate\/new$/, "С3: «Создать» goes back to the estimate");
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="est-client-card"]')].some((e) => e.getClientRects().length > 0 && e.innerText.includes("Nora Park")), null, { timeout: 8000 });
  const card = await tid("est-client-card").innerText();
  h.expect(/Nora Park/.test(card) && /551 Elm St/.test(card), `С3: the new client and their address are picked (${card.replace(/\n/g, " | ")})`);
  h.expect(await typed(), "С3: the typed line is still there");
  // the store writes to the device a moment later: wait for the client in it (what is checked), never for seconds
  await p.waitForFunction(() => (localStorage.getItem("octo.db.v5") || "").includes("551 Elm St"), null, { timeout: 8000 });
  const db1 = await h.db();
  const nora = db1.customers.find((c) => c.name === "Nora Park");
  h.expect(!!nora && db1.properties.some((x) => x.customerId === nora.id && x.address === "551 Elm St"), "С3: the client and their property are in the store");
  await h.shot("estimate-new-client-picked");
};
