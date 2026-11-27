/**
 * e2e 428 — «Связано» is a group of rows (DS §7.5, rule 12; founder 27.11.2026, #3064 / #3065: no column or canvas of buttons;
 * before: chips, #1495 п.3), the director, every view, by testID: each parent of an invoice and of a receipt is a row of the group
 * «Связано» — a button (the whole row presses), its own words, no chip-button around it; the row still opens its parent.
 * (v2 #2350: the job's header names its client and address, so its «Связано» hides them — features/RelatedBlock `hide`.)
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const check = async (path, kinds) => {
    await h.go(path);
    await tid("related-line").waitFor({ timeout: 8000 });
    h.expect(/Связано/.test(await tid("related-line").innerText()), `${path}: the group is titled «Связано»`);
    for (const k of kinds) {
      await tid(`related-${k}`).waitFor({ timeout: 8000 });
      const r = await tid(`related-${k}`).evaluate((e) => ({ role: e.getAttribute("role"), inGroup: !!e.closest('[data-testid="related-line"]'), text: e.innerText.trim() }));
      h.expect(r.role === "button", `${path}: the «${k}» row presses (${r.role})`);
      h.expect(r.inGroup, `${path}: the «${k}» row is inside «Связано»`);
      h.expect(r.text.length > 0 && !/›\s*$/.test(r.text), `${path}: the «${k}» row has its words, the «›» is the row's chevron, not a chip's text (${r.text})`);
    }
  };
  await check("/invoice/i1", ["job", "customer"]);
  await h.shot("invoice");
  await check("/receipt/pay3", ["invoice", "job", "customer"]);
  // a row still opens its parent
  await tid("related-customer").click();
  await p.waitForURL(/\/client\//, { timeout: 8000 });
};
