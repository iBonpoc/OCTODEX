/**
 * e2e 383 — the estimate's card: one main button and «⋯» instead of a row of six pills (founder 14.11, #1412; DS §7.3, §8.9, Б4),
 * a sent estimate (EST-0006) as the director, every view, by testID:
 * - no action of the card stands on the page: «Изменить», «Как видит клиент», «Сохранить как шаблон», «PDF», «Отозвать ссылку»
 *   are in «⋯» only;
 * - the main button «Отправить ещё раз» (the estimate is sent already): on a phone pinned at the bottom (ActionBar, no tab bar under it), from 820 at the top of
 *   the content (no bar);
 * - «⋯» opens the menu in Б4's order: Изменить · PDF · Как видит клиент · Сохранить как шаблон… · Отозвать ссылку — the dangerous one last;
 * - «Отозвать ссылку» runs at once with the toast «Отменить» (it can be undone — rule 5, no dialog).
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const visible = async (id) => (await p.getByTestId(id).locator("visible=true").count()) > 0;
  const phone = h.layout.width < 820;

  await h.go("/estimate/e6");
  await tid("est-more").waitFor({ timeout: 8000 });
  for (const id of ["est-act-edit", "est-act-client", "est-act-template", "est-act-pdf", "est-act-revoke", "est-open-client", "est-pdf", "est-save-template"]) {
    h.expect(!(await visible(id)), `«${id}» is not on the page (it lives in «⋯»)`);
  }

  // the main button: pinned on a phone, at the top of the content from 820
  await tid("est-send").waitFor({ timeout: 3000 });
  h.expect(/Отправить ещё раз/.test((await tid("est-send").textContent()) || ""), "a sent estimate: «Отправить ещё раз», not «Отправить клиенту»");
  if (!phone) {
    const btn = await tid("est-send").boundingBox();
    h.expect(btn && btn.width < 400, `from 820 the button is as wide as its words (${btn && btn.width})`);
  }
  h.expect((await visible("est-view-actionbar")) === phone, phone ? "the main button is in the pinned bar" : "no pinned bar from 820");
  if (phone) {
    const bar = await tid("est-view-actionbar").boundingBox();
    const vp = p.viewportSize();
    h.expect(bar && Math.abs(bar.y + bar.height - vp.height) <= 2, `the bar stands on the bottom edge (${bar && bar.y + bar.height} / ${vp.height})`);
    h.expect((await p.getByTestId("tab-bar").locator("visible=true").count()) === 0, "no tab bar under the pinned bar");
  }
  await h.shot("card");

  // «⋯»: Б4's order, the dangerous one last
  await tid("est-more").getByRole("button").click();
  await tid("est-act-edit").waitFor({ timeout: 3000 });
  const order = await p.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="est-act-"]')].filter((e) => e.offsetParent !== null).map((e) => ({ id: e.getAttribute("data-testid"), y: e.getBoundingClientRect().y })).sort((a, b) => a.y - b.y).map((x) => x.id),
  );
  h.expect(JSON.stringify(order) === JSON.stringify(["est-act-edit", "est-act-pdf", "est-act-client", "est-act-template", "est-act-revoke"]), `the menu in Б4's order: ${order.join(", ")}`);
  await h.shot("menu");

  // «Отозвать ссылку»: at once, with «Отменить»
  const token = async () => (await h.db()).estimates.find((x) => x.id === "e6").linkRevokedAt ?? null;
  h.expect((await token()) === null, "the link is live before");
  await tid("est-act-revoke").click();
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="toast-undo"]')].some((e) => e.offsetParent !== null), null, { timeout: 4000 });
  // the store writes a moment later: wait for the saved estimate itself
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates?.find((x) => x.id === "e6")?.linkRevokedAt, null, { timeout: 4000 });
  await h.shot("revoked");
};
