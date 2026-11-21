/**
 * e2e 384 — the estimate's screen: the icons under the header, ONE main step and «⋯» (prototype v2 #2350, the Object template;
 * before it — founder 14.11, #1412), a sent estimate (EST-0006) as the director, every view, by testID:
 * - the icon row under the header: SMS · Почта · Ссылка · PDF · Изменить (`est-act-*`, `estimate-screen-actions`);
 * - the main step «Напомнить» (the estimate is sent already) stands under the header, above the sections — no pinned bar
 *   (П3, founder 21.11);
 * - «⋯» of the header: Как видит клиент · Сохранить как шаблон… · Подписать здесь · Отозвать ссылку — the dangerous one last;
 *   no icon of the row is repeated in it;
 * - «Отозвать ссылку» asks first (the template's confirm), then runs with the toast «Отменить» (rule 5).
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const visible = async (id) => (await p.getByTestId(id).locator("visible=true").count()) > 0;

  await h.go("/estimate/e6");
  await tid("estimate-screen-more").waitFor({ timeout: 8000 });
  const row = ["est-act-sms", "est-act-email", "est-act-copy", "est-act-pdf", "est-act-edit"];
  for (const id of row) h.expect((await tid("estimate-screen-actions").getByTestId(id).count()) === 1, `«${id}» is an icon of the row under the header`);
  for (const id of ["est-act-client", "est-act-template", "est-act-revoke"]) h.expect(!(await visible(id)), `«${id}» is not on the page (it lives in «⋯»)`);

  // the main step: under the header, above the sections; no pinned bar
  await tid("est-send").waitFor({ timeout: 3000 });
  h.expect(/Напомнить/.test((await tid("est-send").textContent()) || ""), "a sent estimate: «Напомнить», not «Отправить клиенту»");
  const btn = await tid("est-send").boundingBox();
  const head = await tid("estimate-screen-actions").boundingBox();
  const secs = await tid("estimate-screen-sections").boundingBox();
  h.expect(btn && head && secs && btn.y > head.y && btn.y < secs.y, `the main step stands under the icons, above the sections (${btn && btn.y} / ${head && head.y} / ${secs && secs.y})`);
  h.expect(btn && btn.width < 400, `the button is as wide as its words (${btn && btn.width})`);
  h.expect(!(await visible("est-view-actionbar")), "no pinned bar");
  await h.shot("card");

  // «⋯»: the dangerous one last, no icon of the row in it
  await tid("estimate-screen-more").getByRole("button").first().click();
  await tid("menu-items").waitFor({ timeout: 3000 });
  const order = await tid("menu-items").evaluate((m) =>
    [...m.querySelectorAll('[role="menuitem"]')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => ({ id: e.getAttribute("data-testid"), y: e.getBoundingClientRect().y })).sort((a, b) => a.y - b.y).map((x) => x.id),
  );
  h.expect(JSON.stringify(order) === JSON.stringify(["est-act-client", "est-act-template", "est-sign-here", "est-act-revoke"]), `the menu: ${order.join(", ")}`);
  await h.shot("menu");

  // «Отозвать ссылку»: asks first, then runs with «Отменить»
  const revoked = async () => (await h.db()).estimates.find((x) => x.id === "e6").linkRevokedAt ?? null;
  h.expect((await revoked()) === null, "the link is live before");
  await tid("est-act-revoke").click();
  await tid("tpl-confirm-yes").waitFor({ timeout: 3000 });
  h.expect((await revoked()) === null, "nothing revoked before the confirm");
  await tid("tpl-confirm-yes").click();
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="toast-undo"]')].some((e) => e.offsetParent !== null), null, { timeout: 4000 });
  // the store writes a moment later: wait for the saved estimate itself
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates?.find((x) => x.id === "e6")?.linkRevokedAt, null, { timeout: 4000 });
  await h.shot("revoked");
};
