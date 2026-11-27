/**
 * e2e 558 — an estimate that went out remembers it after an edit (#3058; map S6). Every view, the director, the sent EST-0006 (e6):
 * - edit it and press «Готово»: it is a draft again (the server's rule), yet its header says «Изменена после отправки» (not «Черновик»);
 * - open the editor again: the main button is «Отправить изменения», not «Отправить» (the client has the older version).
 * Before the fix the save wiped the moment it was sent: «Черновик» and «Отправить». By testID; waits on what it checks.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const est = async () => ((await h.db()).estimates || []).find((e) => e.id === "e6");

  await h.go("/estimate/new?id=e6");
  await tid("ue-title").waitFor({ timeout: 8000 });
  h.expect((await est()).status === "sent", "EST-0006 is sent");
  await tid("ue-title").locator("input, textarea").first().fill("Carpet, railing, bulb, haul-away · 558");
  await tid("ue-save").click();
  await p.waitForFunction(() => !/\/estimate\/new/.test(location.pathname), null, { timeout: 8000 });
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).find((e) => e.id === "e6")?.status === "draft", null, { timeout: 8000 });
  const after = await est();
  h.expect(!!after.lastSentAt, `the moment it went out is kept (lastSentAt ${after.lastSentAt})`);

  await h.go("/estimate/e6");
  await tid("estimate-head").waitFor({ timeout: 8000 });
  const head = await tid("estimate-screen").innerText();
  h.expect(/Изменена после отправки/.test(head), "the header says «Изменена после отправки»");
  await h.shot("changed-after-send");

  await h.go("/estimate/new?id=e6");
  await tid("est-bar-send").waitFor({ timeout: 8000 });
  h.expect((await tid("est-bar-send").innerText()).trim() === "Отправить изменения", `the editor: «Отправить изменения» (${(await tid("est-bar-send").innerText()).trim()})`);
};
