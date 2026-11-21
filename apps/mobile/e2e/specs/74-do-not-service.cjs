/**
 * Wave 4b-1 «Не обслуживаем» (docs/specs/04 §12, PRD CUST-US-13): the director marks a client with a reason — nothing new
 * for them on the phone: no new estimate or job in the client's «＋» (v2 #2350; the task, note and property stay), no measure, not in the estimate's client picker, an old estimate is not sent again,
 * their lead offers only «Открыть клиента», and a new lead with their phone gets the red mark (it is still saved).
 * The server refuses the same (db T44). Plus the 4a leftover: an old taxed draft of a client who became «Без налога»
 * is sent without tax (re-saved before the send). Only the director and the office set or lift the mark: sales
 * get archive only and cannot lift a mark (db T58).
 */
const { pressEscUntilClosed, sheetGone } = require("../sheet.cjs");
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const S = "client-screen";
  // v2 (#2350): what makes something new on the client is «＋» of its header (`client-screen-create`): its estimate and job items
  const plus = () => p.locator('[data-testid="fab"]:visible, [data-testid="fab-header"]:visible');
  const makes = async () => {
    await p.getByTestId(`${S}-create`).locator("visible=true").first().getByRole("button").first().click();
    await p.getByTestId("menu-items").locator("visible=true").first().waitFor({ timeout: 3000 });
    const n = { estimate: await p.getByTestId("client-create-estimate").locator("visible=true").count(), job: await p.getByTestId("client-create-job").locator("visible=true").count() };
    await pressEscUntilClosed(p, p.getByTestId("menu-items").locator("visible=true").first());
    return n;
  };
  const status = () => p.getByTestId("client-header-status").locator("visible=true").first();

  // Linda (c3): a sent estimate e6 and her lead l5
  await h.go("/client/c3");
  const m0 = await makes();
  h.expect(m0.estimate === 1 && m0.job === 1, `an ordinary client: «＋ → Смета» and «＋ → Работа» (${JSON.stringify(m0)})`);
  await status().click();
  await h.sheet().getByRole("radio", { name: "Не обслуживаем" }).click();
  await h.sheet().getByPlaceholder("Почему не обслуживаем").waitFor({ timeout: 5000 });
  await h.expectText(/Новые работы, сметы и выезды этому клиенту не назначить/, "the sheet says what the mark does");
  await h.sheet().getByPlaceholder("Почему не обслуживаем").fill("Did not pay twice");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click();
  await sheetGone(p);
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.customers.find((c) => c.id === "c3")?.status === "do_not_service", null, { timeout: 5000 });
  const plate = await p.getByTestId("client-plate").locator("visible=true").first().innerText();
  h.expect(/Did not pay twice[\s\S]*Новые работы, сметы и выезды не назначаются/.test(plate), `the client says why and what (${plate})`);
  const m1 = await makes();
  h.expect(m1.estimate === 0 && m1.job === 0 && (await p.getByTestId("client-make-estimate").locator("visible=true").count()) === 0 && (await p.getByTestId("client-measure").locator("visible=true").count()) === 0, `a «do not service» client: no new estimate, job or measure (${JSON.stringify(m1)})`);
  await h.shot("client");
  await h.go("/client/c3?s=estimates");
  h.expect((await plus().count()) + (await p.getByTestId("client-section-new-estimate").locator("visible=true").count()) === 0, "no «＋» and no new estimate on the client's lists either");

  // the estimate: not sent again
  await h.go("/estimate/e6");
  await h.expectText(/Linda Alvarez/, "the estimate opens");
  h.expect((await p.getByTestId("est-send").count()) === 0, "no «Отправить» for her estimate");

  // a new estimate: she is not in the client picker
  await h.go("/estimate/new");
  await h.expectText(/Sarah Mitchell/, "the picker lists clients");
  h.expect((await h.sheet().getByText("Linda Alvarez").count()) === 0, "Linda is not in the picker");

  // her lead: the red mark, the main button only opens the client
  await h.go("/lead/l5");
  await h.expectText(/Не обслуживаем: Linda Alvarez/, "the lead has the red mark");
  h.expect((await p.getByRole("button", { name: "Составить смету" }).count()) === 0, "no «Составить смету»");
  h.expect((await p.getByRole("button", { name: "Открыть клиента" }).count()) >= 1, "«Открыть клиента» instead");
  await h.shot("lead");
  // B3: the mark is a compact card of the client — it opens her card
  await p.getByTestId("lead-noservice-c3").locator("visible=true").first().click();
  await p.waitForURL(/\/client\/c3/, { timeout: 5000 });

  // a new lead with her phone: red mark, still saved
  await h.go("/lead/new");
  await p.getByPlaceholder("(555) 555-0100").fill("3105550110"); await p.waitForTimeout(300);
  await h.expectText(/Не обслуживаем: Linda Alvarez/, "a new lead with her phone shows the red mark");
  await h.expectText(/у клиента с пометкой «Не обслуживаем»/, "and says why");
  await h.shot("new-lead");

  // the mark is lifted: «Создать смету» is back
  await h.go("/client/c3");
  await status().click();
  await h.sheet().getByRole("radio", { name: "Клиент" }).click();
  await sheetGone(p);
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.customers.find((c) => c.id === "c3")?.status === "active", null, { timeout: 5000 });
  h.expect((await makes()).estimate === 1, "«＋ → Смета» is back");

  // only the director and the office set or lift the mark (04 §12.8, db T58): sales get archive only
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("sales")));
  await h.go("/client/c3");
  await status().click();
  await h.sheet().getByRole("radio", { name: "В архиве" }).waitFor({ timeout: 5000 });
  h.expect((await h.sheet().getByRole("radio", { name: "Не обслуживаем" }).count()) === 0, "sales: no «Не обслуживаем» in the menu");
  await pressEscUntilClosed(p);
  // a client marked by the director: sales see the mark but cannot lift it
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === "c3" ? { ...c, status: "do_not_service", statusReason: "Did not pay twice" } : c));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/client/c3");
  h.expect(/Не обслуживаем/.test(await status().innerText()), "sales see the mark");
  h.expect((await p.locator('[data-testid="client-header-status"][role="button"]').count()) === 0, "sales: the mark is not a button");
  await h.shot("sales");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === "c3" ? { ...c, status: "active", statusReason: undefined } : c));
    localStorage.setItem(k, JSON.stringify(s));
  });

  // 4a leftover: a draft with tax for David (c2), then David becomes «Без налога», then the draft is sent
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await require("../estimateLine.cjs").addCatalog(h, "carpet", "Carpet removal", "100"); await require("../estimateLine.cjs").fold(h);
  await p.getByRole("button", { name: "Налог с продаж" }).click(); await p.waitForTimeout(250);
  await h.sheet().getByRole("switch", { name: "Налог с продаж" }).click();
  await h.sheet().locator('input[inputmode="decimal"]').first().fill("9.5");
  await h.sheet().getByRole("button", { name: "Понятно" }).click(); await p.waitForTimeout(300);
  // v2: the builder's one step «Готово» saves the draft (`ue-save`)
  await p.getByTestId("ue-save").locator("visible=true").first().click();
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.estimates.some((e) => e.customerId === "c2" && e.doc && e.status === "draft" && e.doc.settings?.tax?.enabled), null, { timeout: 8000 });
  const est = (await h.db()).estimates.filter((e) => e.customerId === "c2" && e.doc).at(-1);
  h.expect(est && est.status === "draft" && est.doc.settings.tax.enabled === true, "a draft with tax");
  await h.go("/client/edit?id=c2");
  await p.getByRole("switch", { name: "Без налога" }).click();
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(600);
  await h.go(`/estimate/${est.id}`);
  await p.getByTestId("est-send").locator("visible=true").first().click(); // v2: the estimate's main step «Отправить клиенту»
  await h.sheet().getByRole("button", { name: "Копировать ссылку" }).click(); await p.waitForTimeout(800);
  const sent = (await h.db()).estimates.find((e) => e.id === est.id);
  h.expect(sent.status === "sent", `the draft is sent (${sent.status})`);
  h.expect(sent.doc.settings.tax.enabled === false, "sent without tax: re-saved before the send");
};
