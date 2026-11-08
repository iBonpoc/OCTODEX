/**
 * Spec 37 SUP2, the tech of the job (map S11b; db T155, T157): the order of his job on the job's page, where to pick
 * it up, the lines without prices; «Отметить получение» → one line → «Получен частично»; «Всё получено» → «Получен»;
 * «Отменить» → back as it was. He cannot edit or send it.
 */
exports.run = async (h) => {
  const p = h.page;
  const dbWhen = async (ok) => {
    let db = await h.db();
    for (let i = 0; i < 40 && !ok(db); i++) { await p.waitForTimeout(150); db = await h.db(); }
    return db;
  };
  const tap = (id, scope = p) => scope.getByTestId(id).locator("visible=true").first().locator('[role="button"]').first().click();
  const status = () => p.getByTestId("po-status").locator("visible=true").first().innerText();
  await h.go("/today");
  await p.evaluate(() => {
    localStorage.setItem("octo.role.v1", JSON.stringify("tech"));
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    // the server gives the tech no costs (costsVisible false); a cost on the phone would still not be shown to him
    s.db.costsVisible = false;
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/job/j1");
  await p.getByTestId("job-po-po-demo-1").locator("visible=true").first().click();
  await p.waitForURL(/\/purchase-order\/po-demo-1/, { timeout: 5000 });
  h.expect(/Забрать: Home Depot/.test(await p.getByTestId("po-where").locator("visible=true").first().innerText()), "where to pick it up");
  const body = await p.locator("body").innerText();
  h.expect(!/\$/.test(body), "no prices for the tech");
  h.expect((await p.getByTestId("po-send").count()) === 0 && (await p.getByTestId("po-add").count()) === 0 && (await p.getByTestId("po-cancel").count()) === 0,
    "the tech does not edit, send or cancel");
  await h.shot("tech");

  // one line came → partially received
  await tap("po-receive");
  await h.sheet().getByTestId("po-recv-0").locator("input").first().fill("12");
  await tap("po-recv-save", h.sheet());
  await p.waitForFunction(() => document.body.innerText.includes("Получен частично"), null, { timeout: 5000 });
  h.expect(/Получен частично/.test(await status()), "one of two lines → «Получен частично»");
  // the lines show what came at once (the form follows the store — review SUP2-б №1)
  h.expect(/12 \/ 12 ea/.test(await p.getByTestId("po-line-0").locator("visible=true").first().innerText()), "the line shows 12 / 12 at once");

  // everything → received; «Отменить» → partially again
  await tap("po-receive");
  await tap("po-recv-all", h.sheet());
  await tap("po-recv-save", h.sheet());
  let db = await dbWhen((d) => d.purchaseOrders.find((o) => o.id === "po-demo-1")?.status === "received");
  h.expect(db.purchaseOrders.find((o) => o.id === "po-demo-1").status === "received", "«Всё получено» → received");
  await p.waitForTimeout(400); // the toast arms «Отменить» after ~0.3 s (lesson of №5)
  await p.getByRole("button", { name: "Отменить" }).last().click();
  db = await dbWhen((d) => d.purchaseOrders.find((o) => o.id === "po-demo-1")?.status === "partially_received");
  h.expect(db.purchaseOrders.find((o) => o.id === "po-demo-1").status === "partially_received", "«Отменить» puts the previous quantities back");
};
