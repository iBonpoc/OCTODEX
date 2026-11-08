/**
 * Wave 4b-1 «Не обслуживаем» (docs/specs/04 §12, PRD CUST-US-13): the director marks a client with a reason — nothing new
 * for them on the phone: no «＋» on the client, not in the estimate's client picker, an old estimate is not sent again,
 * their lead offers only «Открыть клиента», and a new lead with their phone gets the red mark (it is still saved).
 * The server refuses the same (db T44). Plus the 4a leftover: an old taxed draft of a client who became «Без налога»
 * is sent without tax (re-saved before the send). Only the director and the office set or lift the mark: sales
 * get archive only and cannot lift a mark (db T58).
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const plus = () => p.locator(wide ? '[data-testid="fab-header"]:visible' : '[data-testid="fab"]:visible');

  // Linda (c3): a sent estimate e6 and her lead l5
  await h.go("/client/c3");
  h.expect((await plus().count()) === 1, "an ordinary client has «＋»");
  await p.getByRole("button", { name: /^Статус клиента:/ }).first().click(); await p.waitForTimeout(300);
  await p.getByText("Не обслуживаем", { exact: true }).last().click(); await p.waitForTimeout(400);
  await h.expectText(/Новые работы, сметы и выезды этому клиенту не назначить/, "the sheet says what the mark does");
  await h.sheet().getByPlaceholder("Почему не обслуживаем").fill("Did not pay twice");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).click(); await p.waitForTimeout(600);
  const db = await h.db();
  h.expect(db.customers.find((c) => c.id === "c3").status === "do_not_service", "Linda is «do not service»");
  await h.expectText(/Причина: Did not pay twice · Новые работы, сметы и выезды не назначаются/, "the client says why and what");
  h.expect((await plus().count()) === 0, "no «＋» on a «do not service» client");
  await h.shot("client");
  await h.go("/client/c3?s=estimates");
  h.expect((await plus().count()) === 0, "no «＋» on the client's lists either");

  // the estimate: not sent again
  await h.go("/estimate/e6");
  await h.expectText(/Linda Alvarez/, "the estimate opens");
  h.expect((await p.getByRole("button", { name: "Отправить клиенту" }).count()) === 0, "no «Отправить клиенту» for her estimate");

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

  // the mark is lifted: «＋» is back
  await h.go("/client/c3");
  await p.getByRole("button", { name: /^Статус клиента:/ }).first().click(); await p.waitForTimeout(300);
  await p.getByText("Клиент", { exact: true }).last().click(); await p.waitForTimeout(600);
  h.expect((await h.db()).customers.find((c) => c.id === "c3").status === "active", "Linda is active again");
  h.expect((await plus().count()) === 1, "«＋» is back");

  // only the director and the office set or lift the mark (04 §12.8, db T58): sales get archive only
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("sales")));
  await h.go("/client/c3");
  await p.getByRole("button", { name: /^Статус клиента:/ }).first().click(); await p.waitForTimeout(300);
  await h.expectText(/В архиве/, "sales: the status menu opens with «В архиве»");
  h.expect((await p.getByText("Не обслуживаем", { exact: true }).count()) === 0, "sales: no «Не обслуживаем» in the menu");
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  // a client marked by the director: sales see the mark but cannot lift it
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === "c3" ? { ...c, status: "do_not_service", statusReason: "Did not pay twice" } : c));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/client/c3");
  await h.expectText(/Не обслуживаем/, "sales see the mark");
  h.expect((await p.getByRole("button", { name: /^Статус клиента:/ }).count()) === 0, "sales: the mark is not a button");
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
  await p.getByRole("button", { name: "Добавить позицию" }).first().click(); await p.waitForTimeout(300);
  await h.sheet().getByPlaceholder(/Начните писать/).fill("carpet");
  await h.sheet().getByText("Carpet removal").click(); await p.waitForTimeout(250);
  await h.sheet().locator('input[inputmode="decimal"]').nth(0).fill("100");
  await h.sheet().getByRole("button", { name: "Готово" }).click(); await p.waitForTimeout(250);
  await p.getByRole("button", { name: "Налог с продаж" }).click(); await p.waitForTimeout(250);
  await h.sheet().getByRole("switch", { name: "Налог с продаж" }).click();
  await h.sheet().locator('input[inputmode="decimal"]').first().fill("9.5");
  for (const g of await h.sheet().getByRole("switch", { name: /^Налог с продаж: / }).all()) if ((await g.getAttribute("aria-checked")) !== "true") await g.click();
  await h.sheet().getByRole("button", { name: "Понятно" }).click(); await p.waitForTimeout(300);
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(800);
  const est = (await h.db()).estimates.filter((e) => e.customerId === "c2" && e.doc).at(-1);
  h.expect(est && est.status === "draft" && est.doc.settings.tax.enabled === true, "a draft with tax");
  await h.go("/client/edit?id=c2");
  await p.getByRole("switch", { name: "Без налога" }).click();
  await p.getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(600);
  await h.go(`/estimate/${est.id}`);
  await p.getByRole("button", { name: "Отправить клиенту" }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByRole("button", { name: "Копировать ссылку" }).click(); await p.waitForTimeout(800);
  const sent = (await h.db()).estimates.find((e) => e.id === est.id);
  h.expect(sent.status === "sent", `the draft is sent (${sent.status})`);
  h.expect(sent.doc.settings.tax.enabled === false, "sent without tax: re-saved before the send");
};
