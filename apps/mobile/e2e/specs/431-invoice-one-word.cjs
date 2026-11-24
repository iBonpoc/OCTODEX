/**
 * e2e 431 — one word of an invoice's status everywhere (#1728, #1495, DS §3), the director, every view, by testID:
 * the overdue invoice i1 (due 9 days ago) says «Просрочен 9 дн» in the job's statement, in the client's and in the
 * property's sections — as on its card and in the list (e2e 425) — and never a bare «Просрочено».
 * Seed: i1 — job j2, client c2, property p2, $1,840 owed, due 9 days ago.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const chipOf = async (path, id, tab) => {
    await h.go(path);
    if (tab) {
      const pill = tid(tab);
      await pill.waitFor({ timeout: 8000 });
      await pill.scrollIntoViewIfNeeded();
      await pill.click();
    }
    await tid(id).waitFor({ timeout: 8000 });
    await tid(id).scrollIntoViewIfNeeded();
    return (await tid(id).innerText()).replace(/\s+/g, " ");
  };
  for (const [path, id, where, tab] of [
    ["/job/j2", "statement-invoice-i1", "job", "job-screen-sections-invoices"],
    ["/client/c2", "client-invoice-i1", "client", "client-screen-sections-money"],
    ["/property/p2?s=invoices", "property-invoice-i1", "property"],
  ]) {
    const txt = await chipOf(path, id, tab);
    h.expect(/Просрочен 9 дн/.test(txt), `${where}: the invoice says «Просрочен 9 дн» (${txt})`);
    h.expect(!/Просрочено/.test(txt), `${where}: no bare «Просрочено» (${txt})`);
    await h.shot(where);
  }
};
