/**
 * e2e 2993 — over the parts of «Деньги» ONE line of their own sums, not four tiles (founder 27.11: «четыре слишком много… три в одну
 * строку или убрать»; design/crm review: on «Сметы» and «Оплаты» the tiles showed the invoices' figures). The line is one row; its
 * figures have cents (#2672); on «Счета» «Просрочено» narrows the list to its group and shows it chosen, pressed again — every group.
 * Every view. By testID (rule 19): `money-tiles`, `money-tile-<k>`, `invoice-list-group-<g>`.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  for (const route of ["/estimates", "/invoice?f=owed", "/payments"]) {
    await h.go(route);
    await tid("money-tiles").waitFor({ timeout: 8000 });
    const box = await tid("money-tiles").boundingBox();
    h.expect(box && box.height <= 48, `${route}: the sums are one line (${box && box.height})`);
    const txt = await tid("money-tiles").innerText();
    h.expect(/\$[\d,]+\.\d\d/.test(txt), `${route}: the sums with cents (${txt})`);
    h.expect((await p.locator('[data-testid^="money-tile-"]').locator("visible=true").count()) <= 2, `${route}: no wall of tiles`);
  }
  // «Счета»: «Просрочено» → only its group, chosen; again → all
  await h.go("/invoice?f=owed");
  await tid("money-tile-overdue").waitFor({ timeout: 8000 });
  const groups = () => p.locator('[data-testid^="invoice-list-group-"]').locator("visible=true").count();
  const before = await groups();
  h.expect(before > 1, `more than one group before (${before})`);
  await tid("money-tile-overdue").click();
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid^="invoice-list-group-"]')].filter((e) => e.offsetParent !== null).length === 1, null, { timeout: 5000 });
  h.expect(await tid("invoice-list-group-overdue").isVisible(), "«Просрочено» — only the overdue group");
  h.expect((await tid("money-tile-overdue").getAttribute("aria-selected")) === "true", "the part is said chosen (aria-selected)");
  await h.shot("overdue-on");
  await tid("money-tile-overdue").click();
  await p.waitForFunction((n) => [...document.querySelectorAll('[data-testid^="invoice-list-group-"]')].filter((e) => e.offsetParent !== null).length === n, before, { timeout: 5000 });
  h.expect(true, "pressed again — every group");
};
