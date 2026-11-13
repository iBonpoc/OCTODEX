/**
 * e2e 313 — «не найдено» is one screen for every object (DS §13, Н-65, S-46/S-47), every view, by testID: a lead, an
 * estimate, an order, a supplier and a legal document that do not exist say «<Object> не найден(а)», why, and offer the
 * way back to their list; no silent redirect, no «Ничего не найдено» with a magnifier.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const cases = [
    { path: "/lead/zzz-no-such-lead", id: "lead-not-found", re: /Лид не найден/, back: /\/leads/ },
    { path: "/estimate/zzz-no-such-estimate", id: "estimate-not-found", re: /Смета не найдена/, back: /\/estimates/ },
    { path: "/purchase-order/zzz-no-such-order", id: "po-not-found", re: /Заказ не найден/, back: /\/purchase-orders/ },
    { path: "/suppliers/zzz-no-such-supplier", id: "sup-not-found", re: /Поставщик не найден/, back: /\/suppliers/ },
    { path: "/legal/zzz-no-such-doc", id: "legal-not-found", re: /Такого документа нет/, back: null },
  ];
  for (const c of cases) {
    await h.go(c.path);
    await tid(`${c.id}-back`).waitFor({ timeout: 8000 });
    const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    h.expect(c.re.test(body), `${c.id}: says what is missing`);
    h.expect(/удалили или ссылка устарела/.test(body), `${c.id}: says why`);
    h.expect(!/Ничего не найдено/.test(body), `${c.id}: not «Ничего не найдено»`);
    if (c.back) {
      await tid(`${c.id}-back`).getByRole("button").click();
      await p.waitForURL((u) => c.back.test(u.pathname), { timeout: 8000 });
    }
  }
  await h.shot("estimate");
};
