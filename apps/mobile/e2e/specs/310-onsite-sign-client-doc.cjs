/**
 * e2e 310 — signing on site shows the client what /p/ and the PDF show, in the client's language (#1270, rule 7). Every view.
 * A draft with a section, a priced line, a line hidden from the client at $0, a line with quantity 0, and a customer whose
 * document language is Spanish while the app is Russian:
 * - the priced line is shown; the hidden $0 line and the quantity-0 line are not;
 * - the section's subtotal reads in the client's language («Subtotal: …»), not the app's («Итого: …»).
 * By testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";
const EID = "e-e2e-310";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  await h.go("/today");
  const s = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  {
    const base = s.db.estimates.find((e) => e.doc && e.customerId);
    const line = (lid, name, x) => ({ id: lid, group: "service", name, quantity: "1", unit: "ea", unitPriceCents: 5000, sectionId: "S", ...x });
    const doc = JSON.parse(JSON.stringify(base.doc));
    doc.options = [{ ...doc.options[0], sections: [{ id: "S", title: "Roof" }], lines: [
      line("l-shown", "Shown line", {}),
      line("l-hidden", "Hidden freebie", { unitPriceCents: 0, clientVisible: false }),
      line("l-zero", "Zero quantity", { quantity: "0" }),
    ] }];
    const c = s.db.customers.find((x) => x.id === base.customerId);
    c.people = [{ id: `${c.id}-main`, name: c.name, role: "main", phones: [], emails: [], language: "es" }];
    s.db.estimates.push({ ...base, id: EID, number: "EST-0310", status: "draft", token: undefined, sentAt: undefined, viewedAt: undefined, approval: undefined, countersign: undefined, linkRevokedAt: undefined, depositPaidAt: undefined, doc });
  }
  await h.seed(DB_KEY, s);
  await h.go(`/estimate/${EID}`);
  await tid("sign-client-doc").waitFor({ timeout: 8000 });
  await tid("est-client-line-l-shown").waitFor({ timeout: 3000 });
  h.expect((await tid("est-client-line-l-hidden").count()) === 0, "a line hidden from the client at $0 is not shown on site");
  h.expect((await tid("est-client-line-l-zero").count()) === 0, "a quantity-0 line is not shown on site");
  const sub = (await tid("est-client-subtotal-S").innerText()).replace(/\s+/g, " ");
  h.expect(/Subtotal: Roof/.test(sub), `the subtotal reads in the client's language (es): ${sub}`);
  h.expect(!/Итого/.test(sub), "not in the app's language");
  await h.shot("onsite");
};
