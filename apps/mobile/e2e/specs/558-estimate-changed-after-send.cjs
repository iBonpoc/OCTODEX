/**
 * e2e 558 — an estimate that went out remembers it after an edit (#3058; map S6). Every view, the director, the sent EST-0006 (e6):
 * - edit it and press «Готово»: it is a draft again (the server's rule), yet its header says «Изменена после отправки» (not «Черновик»);
 * - its card's main step is «Отправить изменения» with when it went out, never «Клиент её ещё не видел» (#3160);
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
  // #3160: the card's main step says the same as the chip and the editor
  await tid("est-send").waitFor({ timeout: 8000 });
  const step = (await tid("est-send").innerText()).trim();
  h.expect(step.startsWith("Отправить изменения"), `the card's step: «Отправить изменения» (${step})`);
  h.expect(!/ещё не видел/.test(await tid("estimate-screen").innerText()), "the card never says «Клиент её ещё не видел» to an estimate that went out");
  // 1280: the same estimate in the panel beside the list — its button says the same (the second look of the card)
  if (h.layout.width >= 1280) {
    await h.go("/estimates?open=e6");
    const panel = p.getByTestId("est-send").locator("visible=true").last();
    await panel.waitFor({ timeout: 8000 });
    h.expect((await panel.innerText()).trim().startsWith("Отправить изменения"), `the list panel: «Отправить изменения» (${(await panel.innerText()).trim()})`);
  }
  await h.shot("changed-after-send");

  await h.go("/estimate/new?id=e6");
  await tid("est-bar-send").waitFor({ timeout: 8000 });
  h.expect((await tid("est-bar-send").innerText()).trim() === "Отправить изменения", `the editor: «Отправить изменения» (${(await tid("est-bar-send").innerText()).trim()})`);
};
