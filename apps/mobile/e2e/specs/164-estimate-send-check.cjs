/**
 * e2e 164 — C5 «проверка перед отправкой сметы» (docs/specs/33-gutters-estimate.md П23.9). Every view.
 * A draft whose lines a module marked: «нет цены», «тестовая цена», «нет в замере», and a «нет цены» line with quantity 0.
 * - on site: «Подписать на месте» is replaced by the same check (the client signs what they would get by link);
 * - «Отправить клиенту»: «Нельзя отправить», the send buttons are off, no «Всё равно отправить»; the quantity-0 line is
 *   not listed (0 is how a part is left out);
 * - «Изменить смету» → the editor; a price on the «нет цены» line → saved;
 * - again: «Проверьте перед отправкой», still off → «Всё равно отправить» → «Копировать ссылку» → sent;
 * - the client page (/p/) has neither the quantity-0 line nor any of the module's words.
 * The core reads only the source flags — the estimate is seeded, no module needed. By testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";
const EID = "e-e2e-164";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 60) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const est = async () => ((await h.db())?.estimates ?? []).find((e) => e.id === EID);
  const disabled = async (key) => (await tid(`send-${key}`).getByRole("button").getAttribute("aria-disabled")) === "true";
  const openSend = async () => { await tid("est-send").getByRole("button").click(); await tid("send-check").waitFor({ timeout: 8000 }); };

  await h.go("/today");
  await p.evaluate(({ k, id }) => {
    const s = JSON.parse(localStorage.getItem(k));
    const base = s.db.estimates.find((e) => e.doc && e.customerId);
    const src = (x) => ({ module: "gutters", key: `k.${Math.random()}`, ...x });
    const line = (lid, name, x) => ({ id: lid, group: "material", name, quantity: "10", unit: "ft", unitPriceCents: 500, ...x });
    const doc = JSON.parse(JSON.stringify(base.doc));
    doc.options = [{ ...doc.options[0], lines: [
      line("l-own", "Own line", {}),
      line("l-np", "Downspout 3x4", { unitPriceCents: 0, source: src({ noPrice: true }) }),
      line("l-tp", "Gutter 5in K", { unitPriceCents: 700, source: src({ testPrice: true, priceCents: 700 }) }),
      line("l-g", "End cap", { quantity: "2", unit: "ea", source: src({ gone: true }) }),
      line("l-z", "Leaf guard", { quantity: "0", unitPriceCents: 0, source: src({ noPrice: true }) }),
    ] }];
    s.db.estimates.push({ ...base, id, number: "EST-0164", status: "draft", token: undefined, sentAt: undefined, viewedAt: undefined, approval: undefined, countersign: undefined, linkRevokedAt: undefined, depositPaidAt: undefined, doc });
    localStorage.setItem(k, JSON.stringify(s));
  }, { k: DB_KEY, id: EID });

  // the check: «нет цены» stops the send
  await h.go(`/estimate/${EID}`);
  // on site: the client cannot sign it either (review C5 №2)
  await tid("sign-check-blocked").waitFor({ timeout: 8000 });
  h.expect((await tid("sign-check-noPrice").count()) === 1, "on-site signing is stopped by «нет цены»");
  await openSend();
  h.expect((await tid("send-check-blocked").count()) === 1, "«Нельзя отправить»");
  for (const k of ["noPrice", "testPrice", "gone"]) h.expect((await tid(`send-check-${k}`).count()) === 1, `the ${k} group is listed`);
  h.expect(/Downspout 3x4/.test(await tid("send-check-noPrice").innerText()), "the «нет цены» line by name");
  h.expect(!/Leaf guard/.test(await tid("send-check").innerText()), "the quantity-0 line is not listed");
  h.expect((await tid("send-check-force").count()) === 0, "no «Всё равно отправить» while a line has no price");
  h.expect(await disabled("copy"), "the send buttons are off");
  await h.shot("blocked");

  // «Изменить смету» → a price on the line → saved
  await tid("send-check-edit").getByRole("button").click();
  await p.waitForURL(new RegExp(`/estimate/new\\?id=${EID}`), { timeout: 8000 });
  await tid("ue-line-marks-l-np").click();
  await tid("ue-line-price").locator("input").waitFor({ timeout: 5000 });
  await tid("ue-line-price").locator("input").fill("12");
  await tid("ue-line-save").getByRole("button").click();
  await waitFor(async () => (await tid("ue-line-price").count()) === 0, "the line sheet closed");
  await tid("ue-save").getByRole("button").click();
  await waitFor(async () => (await est())?.doc?.options?.[0]?.lines?.find((l) => l.id === "l-np")?.unitPriceCents === 1200, "the price is saved");
  await p.waitForURL(new RegExp(`/estimate/${EID}`), { timeout: 8000 });

  // again: only a test price and a line not in the measurement → can force
  await h.go(`/estimate/${EID}`);
  await openSend();
  h.expect((await tid("send-check-review").count()) === 1, "«Проверьте перед отправкой»");
  h.expect((await tid("send-check-noPrice").count()) === 0, "no «нет цены» left");
  h.expect(await disabled("copy"), "still off before «Всё равно отправить»");
  await h.shot("review");
  await tid("send-check-force").getByRole("button").click();
  await waitFor(async () => (await tid("send-check").count()) === 0, "the check is gone after «Всё равно отправить»");
  await waitFor(async () => !(await disabled("copy")), "the send buttons are on");
  await tid("send-copy").getByRole("button").click();
  await waitFor(async () => (await est())?.status === "sent", "the estimate is sent");

  // the client page: no quantity-0 line, no module words
  const token = (await est()).token;
  h.expect(!!token, "a client link");
  await h.go(`/p/${token}`);
  await h.expectText(/Gutter 5in K/, "the client page shows the estimate");
  const body = await h.text();
  h.expect(!/Leaf guard/.test(body), "the quantity-0 line is not on the client page");
  h.expect(!/Тестовая цена|Нет в замере|Test price|Not in measurement|Из замера|From measurement/.test(body), "no module marks for the client");
};
