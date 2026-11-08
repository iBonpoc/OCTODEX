/**
 * Spec 37 SUP2 (map S11b «работа → заказ поставщику»), the office, in the demo (the server side is db T155–T159):
 * - a job whose estimate has materials of the price list → «Заказ поставщику» → one draft for Home Depot with the
 *   job's materials in purchase units («проверьте упаковку» without a pack size); a second tap opens the same draft;
 * - the order: delivery address, a line's quantity, «Добавить позицию» from the catalog → «Отправить поставщику» →
 *   sent, revision 1, the supplier's snapshot; the order is on the job and in «Заказы поставщикам»;
 * - «Отменить заказ» asks first → cancelled; sales has no «Заказы поставщикам».
 * By testID (CHECKS §9 №2); waits for what it checks.
 */
exports.run = async (h) => {
  const p = h.page;
  const dbWhen = async (ok) => {
    let db = await h.db();
    for (let i = 0; i < 40 && !ok(db); i++) { await p.waitForTimeout(150); db = await h.db(); }
    return db;
  };
  const tap = (id, scope = p) => scope.getByTestId(id).locator("visible=true").first().locator('[role="button"]').first().click();
  // the kitchen job (j2) gets the estimate with the bracket and the bulb (both Home Depot's)
  await h.go("/today");
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.jobs = s.db.jobs.map((j) => (j.id === "j2" ? { ...j, estimateId: "e6" } : j));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/job/j2");
  await p.getByTestId("job-orders").locator("visible=true").first().waitFor({ timeout: 5000 });
  await tap("job-orders-make");
  await p.waitForURL(/\/purchase-order\//, { timeout: 5000 });
  let db = await dbWhen((d) => (d.purchaseOrders ?? []).some((o) => o.jobId === "j2"));
  const ord = db.purchaseOrders.find((o) => o.jobId === "j2");
  h.expect(ord.status === "draft" && ord.supplierId === "sup-hd", "a draft for the job's supplier");
  const br = ord.lines.find((l) => l.catalogItemId === "cat-bracket");
  h.expect(br && br.qty === "12" && br.checkPack === true && ord.lines.some((l) => l.catalogItemId === "cat-led"), "the job's materials, in purchase units, «check the pack size»");
  h.expect(/проверьте упаковку/.test(await p.getByTestId("po-line-0").locator("visible=true").first().innerText()) ||
    /проверьте упаковку/.test(await p.getByTestId("po-line-1").locator("visible=true").first().innerText()), "the line says «проверьте упаковку»");
  await h.shot("draft");
  // a second tap opens the same draft, no double
  await h.go("/job/j2");
  await tap("job-orders-make");
  await p.waitForURL(new RegExp(`/purchase-order/${ord.id}`), { timeout: 5000 });
  db = await h.db();
  h.expect(db.purchaseOrders.filter((o) => o.jobId === "j2").length === 1, "a second «Заказ поставщику» opens the same draft");

  // add an item, change a quantity, send
  await tap("po-add");
  await h.sheet().getByPlaceholder(/Найти|Search|Поиск/).first().fill("GFCI");
  await h.sheet().getByText("GFCI outlet 20A", { exact: true }).first().click();
  await p.getByTestId("po-qty-0").locator("visible=true").first().locator("input").first().fill("13");
  // two quick taps are one send (review SUP2-б №2)
  const send = p.getByTestId("po-send").locator("visible=true").first().locator('[role="button"]').first();
  await send.click();
  await send.click({ timeout: 1000 }).catch(() => {});
  db = await dbWhen((d) => d.purchaseOrders.find((o) => o.id === ord.id)?.status === "sent");
  const sent = db.purchaseOrders.find((o) => o.id === ord.id);
  h.expect(sent.revision === 1 && sent.supplierName === "Home Depot" && sent.lines.length === 3 && sent.lines.some((l) => l.qty === "13"), "sent: revision 1, the supplier's snapshot, the lines as edited");

  // a re-send to another supplier: revision 2, the new supplier's snapshot (review SUP2-б №3)
  await h.go(`/purchase-order/${ord.id}`);
  await tap("po-supplier");
  await h.sheet().getByTestId("sup-pick-sup-sw").locator('[role="button"]').first().click();
  await tap("po-send");
  db = await dbWhen((d) => d.purchaseOrders.find((o) => o.id === ord.id)?.revision === 2);
  const re = db.purchaseOrders.find((o) => o.id === ord.id);
  h.expect(re.revision === 2 && re.supplierId === "sup-sw" && re.supplierName === "Sherwin-Williams" && re.supplierPhone === "(555) 010-0200", "re-sent: revision 2, the new supplier's snapshot");

  // the job and the list show it
  await h.go("/job/j2");
  h.expect(/Отправлен/.test(await p.getByTestId(`job-po-${ord.id}`).locator("visible=true").first().innerText()), "the job shows the sent order");
  await h.go("/purchase-orders");
  await p.getByTestId(`po-card-${ord.id}`).locator("visible=true").first().waitFor({ timeout: 5000 });
  await h.shot("list");

  // cancel asks first
  await h.go(`/purchase-order/${ord.id}`);
  await tap("po-cancel");
  await tap("po-cancel-yes", h.sheet());
  db = await dbWhen((d) => d.purchaseOrders.find((o) => o.id === ord.id)?.status === "cancelled");
  h.expect(db.purchaseOrders.find((o) => o.id === ord.id).status === "cancelled", "cancelled after «Да, отменить»");

  // sales: no orders
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("sales")));
  await h.go("/more");
  h.expect(!/Заказы поставщикам/.test(await p.locator("body").innerText()), "sales: no «Заказы поставщикам» in the menu");
};
