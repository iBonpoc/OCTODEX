/**
 * e2e 198 cloud — spec 37 SUP2 against a real Supabase: an order for stock made on the phone → the server's number
 * PO-…, a draft (t26); the supplier and a line from the price list → «Отправить» → sent, revision 1, the supplier's
 * snapshot; «Отметить получение» → public.po_receive → received; the expected cost only in the side table.
 * The supplier and the item are put in through the API (test prices); everything else through the app.
 */
const { signIn, waitRows } = require("../signIn.cjs");

exports.run = async (h, { seed, admin }) => {
  const p = h.page;
  const a1 = seed.users.a1;
  await signIn(h, a1);
  const tag = `P198 ${Date.now().toString(36)}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
  const post = async (table, row) => {
    const r = await fetch(`${seed.url}/rest/v1/${table}`, {
      method: "POST", headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`);
    return (await r.json())[0];
  };
  const sup = await post("suppliers", { company_id: a1.companyId, name: `${tag} Supply`, phone: "555-0198" });
  const item = await post("catalog_items", { company_id: a1.companyId, kind: "material", name: `${tag} bracket (test)`, unit: "ea", unit_price_cents: 0, supplier_id: sup.id, purchase_unit: "box", pack_size: 50 });
  await post("catalog_item_costs", { item_id: item.id, company_id: a1.companyId, unit_cost_cents: 37 });
  const tap = (id, scope = p) => scope.getByTestId(id).locator("visible=true").first().locator('[role="button"]').first().click();

  // the phone reads the new supplier and item
  await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("octo.cloud.v1.")).forEach((k) => localStorage.removeItem(k)));
  await h.go("/purchase-orders");
  await p.getByRole("button", { name: "Новый заказ" }).first().click();
  await p.waitForURL(/\/purchase-order\//, { timeout: 10000 });
  const id = p.url().split("/purchase-order/")[1].split(/[?#]/)[0];
  const [made] = await waitRows(admin, `purchase_orders?select=id,number,status&id=eq.${id}`, (r) => r.length === 1 && /^PO-/.test(r[0].number), "the new order with the server's number");
  h.expect(made.status === "draft", "a new order is a draft");

  await tap("po-supplier");
  await h.sheet().getByTestId(`sup-pick-${sup.id}`).locator('[role="button"]').first().click();
  await tap("po-add");
  await h.sheet().getByPlaceholder(/Найти|Search|Поиск/).first().fill(tag);
  await h.sheet().getByText(`${tag} bracket (test)`, { exact: true }).first().click();
  await p.getByTestId("po-qty-0").locator("visible=true").first().locator("input").first().fill("2");
  await tap("po-send");
  const [sent] = await waitRows(admin, `purchase_orders?select=status,revision,supplier_id,supplier_name&id=eq.${id}`, (r) => r[0]?.status === "sent", "the sent order");
  h.expect(sent.revision === 1 && sent.supplier_id === sup.id && sent.supplier_name === `${tag} Supply`, `sent with the supplier's snapshot (${JSON.stringify(sent)})`);
  const [line] = await waitRows(admin, `purchase_order_lines?select=id,qty,unit,check_pack&po_id=eq.${id}&deleted_at=is.null`, (r) => r.length === 1, "the line");
  h.expect(Number(line.qty) === 2 && line.unit === "box" && line.check_pack === false, `the line in boxes (${JSON.stringify(line)})`);
  const [cost] = await waitRows(admin, `purchase_order_line_costs?select=unit_cost_cents&line_id=eq.${line.id}`, (r) => r.length === 1, "the expected cost");
  h.expect(cost.unit_cost_cents === 1850, `a box of 50 at $0.37 = $18.50 (${cost.unit_cost_cents})`);

  // what came
  await h.go(`/purchase-order/${id}`);
  await tap("po-receive");
  await tap("po-recv-all", h.sheet());
  await tap("po-recv-save", h.sheet());
  const [rec] = await waitRows(admin, `purchase_orders?select=status,received_at&id=eq.${id}`, (r) => r[0]?.status === "received", "the received order");
  h.expect(!!rec.received_at, "received, with the time");
  await h.shot("received");
};
