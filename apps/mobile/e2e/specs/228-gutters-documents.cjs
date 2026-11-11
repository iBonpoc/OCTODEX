/**
 * e2e 228 — карточка замера: шапка, «⋯», «Документы» (основатель 11.11: «открываешь карточку чертежа — внутри
 * документы: заказ для поставщика, чертёж для бригады, документ для клиента»; docs/specs/33-gutters-workflow.md
 * П25.3 Б, Г, PR-H2; «Отправить» и история — H3). Every view.
 * - the head says whom for and where (the client's name, the address), the state («Подписан» — the same word as on
 *   «Замеры») and how it was measured («Рулетка»);
 * - «Документы»: «Для клиента» — «Смета … и чертёж · EN», «Открыть» opens that estimate; «Для бригады» — the cut and the
 *   number of parts; the photos strip; the parts folded under «Подробно»;
 * - 820 / 1280 on its own page: two columns (the documents right of the sheet); the 1280 panel of «Замеры» — one column;
 * - «⋯» → «Точность замера» → «Примерно»: the head says so; «Дублировать» → the copy's card, «Без сметы», «Отменить» —
 *   the copy is gone; a press on whom → «Отвязать (в черновики)» → «Без клиента», «Черновик»; «Удалить» under a signed
 *   estimate says why not; a draft is deleted and «Отменить» brings it back.
 * Finds things by testID; waits on what it checks.
 */
const { pressWhenStill, stands } = require("../gutters.cjs");
const { pressEscUntilClosed } = require("../sheet.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const desktop = h.layout.width >= 1280;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const g = async () => (await db())?.moduleData?.gutters ?? { measurements: [], elements: [] };
  const text = async (id) => (await tid(id).innerText()).replace(/\n/g, " | ");
  const mid = () => new URL(p.url()).searchParams.get("m");
  const menu = async (item) => {
    const it = p.getByRole("menuitem", { name: item, exact: true }).locator("visible=true");
    await it.waitFor({ timeout: 5000 });
    await it.click();
    // the menu leaves before its item acts (#743): wait until it is gone
    await it.waitFor({ state: "hidden", timeout: 5000 });
  };
  const view = async (m) => {
    await h.go(`/module/gutters/view?m=${encodeURIComponent(m)}`);
    await tid("view-screen").waitFor({ timeout: 8000 });
    await stands(tid("view-head"));
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await waitFor(async () => !!(await db())?.company?.modules?.gutters?.enabled, "the trial is on");

  const d0 = await db();
  const client = d0.customers.find((c) => d0.properties.some((q) => q.customerId === c.id));
  const place = d0.properties.find((q) => q.customerId === client.id);
  await p.waitForTimeout(400); // nothing left for the store to write (it writes on leaving within 250 ms)
  const est = await p.evaluate(({ k, propertyId }) => {
    const st = JSON.parse(localStorage.getItem(k));
    const at = (min) => new Date(Date.now() - min * 60000).toISOString();
    const M = (id, x) => ({ id, label: null, status: "ready", propertyId, leadId: null, accuracy: "tape", ...x });
    const run = (id, m, a, b) => ({ id, measurementId: m, kind: "run", geom: { a, b }, attrs: {}, confidence: "drawn" });
    st.db.moduleData = st.db.moduleData || {};
    st.db.moduleData.gutters = {
      measurements: [M("e2e228-signed", { updatedAt: at(2) }), M("e2e228-free", { updatedAt: at(1) })],
      elements: [
        run("e2e228-r1", "e2e228-signed", [0, 0], [240, 0]),
        run("e2e228-r2", "e2e228-signed", [240, 0], [240, 120]),
        { id: "e2e228-d1", measurementId: "e2e228-signed", kind: "downspout", geom: { runId: "e2e228-r2", atIn: 100 }, attrs: {}, confidence: "drawn" },
        run("e2e228-r3", "e2e228-free", [0, 0], [180, 0]),
      ],
    };
    const base = st.db.estimates.find((e) => e.doc?.options?.[0]?.lines?.length);
    const e = JSON.parse(JSON.stringify(base));
    e.id = "e2e228-est";
    e.status = "approved";
    e.doc.options[0].lines[0].source = { module: "gutters", measurementId: "e2e228-signed", at: at(3) };
    st.db.estimates.push(e);
    localStorage.setItem(k, JSON.stringify(st));
    return { id: e.id, number: e.number || "" };
  }, { k: DB_KEY, propertyId: place.id });

  // the head and «Документы» of a signed measurement
  await view("e2e228-signed");
  h.expect((await text("view-who")).includes(client.name) && (await text("view-who")).includes(place.address), `whom for and where (${await text("view-who")})`);
  h.expect(/Подписан/.test(await text("view-state")), `the state (${await text("view-state")})`);
  h.expect(/Рулетка/.test(await text("view-accuracy")), "measured with a tape");
  await tid("view-docs").waitFor({ timeout: 5000 });
  await h.shot("head");
  h.expect(/Для клиента/.test(await text("view-doc-client")) && /и чертёж · EN/.test(await text("view-doc-client")), `the client's: the estimate and the drawing, in English (${await text("view-doc-client")})`);
  h.expect(/Для бригады/.test(await text("view-doc-crew")) && /деталей: \d+/.test(await text("view-doc-crew")), `the crew's: the cut (${await text("view-doc-crew")})`);
  h.expect((await tid("view-photos").count()) === 1, "the photos");
  h.expect((await tid("view-parts").count()) === 0, "the parts are folded");
  await pressWhenStill(tid("view-details").getByRole("button"));
  await tid("view-parts").waitFor({ timeout: 5000 });
  h.expect((await tid("view-run-2").count()) === 1, "«Подробно»: the gutters, the parts");
  if (wide) {
    const a = await tid("view-drawing").boundingBox();
    const d = await tid("view-docs").boundingBox();
    h.expect(d.x > a.x + a.width - 2, "820 / 1280: the documents beside the sheet (two columns)");
  }
  await h.shot("card");
  // the client's «Открыть»: the estimate
  await pressWhenStill(tid("view-pdf-client").getByRole("button"));
  await waitFor(() => new RegExp(`/estimate/${est.id}$`).test(new URL(p.url()).pathname), `the client's document is the estimate (${p.url()})`);

  // «Удалить» under a signed estimate: the item is there, the press says why not
  await view("e2e228-signed");
  await tid("view-more").getByRole("button").click();
  await menu("Удалить замер");
  await waitFor(async () => /подписанная смета/.test(await p.locator("body").innerText()), "a signed one is not deleted: it says why");
  h.expect((await g()).measurements.some((m) => m.id === "e2e228-signed"), "still there");

  // «Точность замера» → «Примерно»
  await view("e2e228-free");
  await tid("view-more").getByRole("button").click();
  await menu("Точность замера");
  await tid("view-accuracy-pick").waitFor({ timeout: 5000 });
  await tid("view-accuracy-pick").getByRole("radio", { name: /^Примерно/ }).click();
  await waitFor(async () => (await g()).measurements.find((m) => m.id === "e2e228-free")?.accuracy === "rough", "the accuracy is saved");
  await pressEscUntilClosed(p);
  await waitFor(async () => /Примерно/.test(await text("view-accuracy")), "the head says «Примерно»");

  // «Дублировать» → the copy's card; «Отменить» — gone
  await tid("view-more").getByRole("button").click();
  await menu("Дублировать");
  await waitFor(() => !!mid() && mid() !== "e2e228-free", "the copy's card opens");
  const copy = mid();
  await tid("view-screen").waitFor({ timeout: 8000 });
  await waitFor(async () => { const x = await g(); return x.measurements.some((m) => m.id === copy && m.propertyId === place.id && m.status === "draft") && x.elements.filter((e) => e.measurementId === copy).length === 1; }, "a draft copy: the same address, its own gutter");
  await waitFor(async () => /Без сметы/.test(await text("view-state")), "the copy has no estimate");
  await h.shot("copy");
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  await waitFor(async () => !(await g()).measurements.some((m) => m.id === copy), "«Отменить»: the copy is gone");

  // whom → «Отвязать (в черновики)»
  await view("e2e228-free");
  await tid("view-who").getByRole("button").click();
  await menu("Отвязать (в черновики)");
  await waitFor(async () => { const m = (await g()).measurements.find((x) => x.id === "e2e228-free"); return !!m && !m.propertyId && !m.leadId; }, "unlinked");
  await waitFor(async () => /Без клиента/.test(await text("view-who")) && /Черновик/.test(await text("view-state")), "the head: «Без клиента», «Черновик»");

  // a draft is deleted; «Отменить» brings it back
  await tid("view-more").getByRole("button").click();
  await menu("Удалить замер");
  await waitFor(async () => !(await g()).measurements.some((m) => m.id === "e2e228-free"), "deleted");
  await waitFor(async () => (await tid("view-screen").count()) === 0, "the card is left");
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  await waitFor(async () => (await g()).measurements.some((m) => m.id === "e2e228-free"), "«Отменить»: it is back");

  // 1280: the same card in the panel of «Замеры» — one column
  if (desktop) {
    await h.go("/module/gutters/list");
    await tid("measurement-e2e228-signed").click();
    await tid("list-panel").getByTestId("view-docs").waitFor({ timeout: 8000 });
    const a = await tid("list-panel").getByTestId("view-drawing").boundingBox();
    const d = await tid("list-panel").getByTestId("view-docs").boundingBox();
    h.expect(d.y > a.y + a.height - 2, "the panel: one column (the documents under the sheet)");
    await h.shot("panel");
  }
};
