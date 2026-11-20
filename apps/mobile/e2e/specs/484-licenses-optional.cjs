/**
 * e2e 484 — #2065 (founder 18.11: «кто хочет, добавляет лицензию, кто не хочет — не добавляет… приложение об этом не должно
 * думать»): licenses and insurance are optional in any state, and the core has no «CA». Every view; h.seed.
 * С1 ДАНО у компании нет ни лицензии, ни страховки (и нет логотипа); КОГДА нажимаю «Продолжить настройку»; ТОГДА открывается
 *    логотип, а не лицензии или страховка; в мастере «Пропустить» на страховке ведёт дальше.
 * С2 ДАНО у компании нет лицензии CSLB; КОГДА открываю отправку сметы; ТОГДА предупреждения о лицензии нет.
 * С3 ДАНО компания в TX; КОГДА добавляю объект клиенту; ТОГДА штат — TX, а не CA.
 * С4 ДАНО «Настройки компании»; ТОГДА у «Лицензии» и «Страховка» — «Необязательно», не «Нужно».
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.company, KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const c = raw.db.company;
  c.licenses = [];
  c.insurance = { ...c.insurance, cglCarrier: undefined, wcCarrier: undefined, wcExempt: false };
  c.skipped = [];
  // one required step left (the logo), so «Продолжить» is on the screen and its target is checked
  c.brand = { ...c.brand, logo: undefined };
  c.address = { ...c.address, line1: "500 Main St", city: "Austin", state: "TX", zip: "78701" };
  const draft = raw.db.estimates.find((e) => e.status === "draft" && e.doc && e.customerId) ?? raw.db.estimates.find((e) => e.doc && e.customerId);
  draft.status = "draft";
  draft.sentAt = undefined;
  await h.seed(KEY, raw);

  // С4 + С1: the company settings — optional, not «Нужно»; the main button does not lead to them
  await h.go("/company");
  await p.getByText("Необязательно").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByText("Необязательно", { exact: true }).locator("visible=true").count()) === 2, "С4 «Лицензии» and «Страховка» read «Необязательно»");
  await h.shot("company");
  await p.getByRole("button", { name: /Продолжить/ }).locator("visible=true").first().click();
  await p.waitForURL((u) => u.pathname.startsWith("/company/"), { timeout: 8000 });
  const next = new URL(p.url()).pathname;
  h.expect(next === "/company/brand", `С1 «Продолжить» skips licenses and insurance and opens the logo step (${next})`);
  // С1: in the wizard «Пропустить» on insurance goes on
  await h.go("/company/insurance?wizard=1");
  await p.getByRole("button", { name: /Пропустить/ }).locator("visible=true").first().click();
  await p.waitForURL((u) => u.pathname === "/company/brand", { timeout: 8000 });
  h.expect(true, "С1 «Пропустить» on «Страховка» goes on to the next step");

  // С2: sending an estimate — no license warning
  await h.go(`/estimate/${draft.id}`);
  await tid("est-send").getByRole("button").click();
  await p.locator('[aria-modal="true"]').last().waitFor({ timeout: 8000 });
  const sheet = await p.locator('[aria-modal="true"]').last().innerText();
  h.expect(!/CSLB|лиценз/i.test(sheet), "С2 no license warning when sending an estimate");
  await h.shot("send");

  // С3: a new property of a client starts in the company's state
  const cust = raw.db.customers[0];
  await h.go(`/client/${cust.id}`);
  await p.getByRole("button", { name: /^(Новый объект|Добавить объект|Объект)$/ }).locator("visible=true").first().click();
  const state = p.locator('[aria-modal="true"]').last().getByRole("textbox", { name: "Штат" }).first();
  await state.waitFor({ timeout: 8000 });
  h.expect((await state.inputValue()) === "TX", `С3 the state of a new property is the company's TX (${await state.inputValue()})`);
};
