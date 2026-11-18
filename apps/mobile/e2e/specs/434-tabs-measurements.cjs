/**
 * e2e 434 — the module's tab «Gutters» in the place of «План» (founder 16.11, #1487: «давай план уберём и сделаем замеры»;
 * the tab is named by the module, not translated — «Gutters», founder 16.11; DS §5.3, 1.15.7),
 * the director, every view, by testID:
 * - the module off: the phone's five tabs are Главная · План · Сообщения · Клиенты · Ещё; no «План» tile in «Ещё»;
 * - Gutters on: still five tabs — Главная · Gutters · Сообщения · Клиенты · Ещё; «План» is a tile in «Ещё» and opens the Plan,
 *   which lights «Ещё»; on 820/1280 the side menu keeps «План» and has «Gutters»;
 * - one word for the messages: the tab and the side menu both say «Сообщения» (no «Чаты» anywhere);
 * - the demo strip says «на этом устройстве» (an iPad or a computer is not a phone).
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const tabIds = async () => tid("tab-bar").locator('[data-testid^="tab-"]').evaluateAll((xs) => xs.map((x) => x.getAttribute("data-testid")));

  await h.go("/today");
  await tid("demo-badge").first().waitFor({ timeout: 8000 });
  h.expect(/Демо · данные только на этом устройстве/.test(await tid("demo-badge").first().innerText()), "the demo strip says «на этом устройстве»");
  if (wide) {
    await tid("side-nav").first().waitFor({ timeout: 8000 });
    h.expect((await tid("side-plan").count()) === 1, "off: «План» in the side menu");
    h.expect(/^Сообщения$/.test((await tid("side-messages").first().innerText()).trim()), "the side menu says «Сообщения»");
  } else {
    await tid("tab-bar").first().waitFor({ timeout: 8000 });
    const off = await tabIds();
    h.expect(JSON.stringify(off) === JSON.stringify(["tab-home", "tab-plan", "tab-messages", "tab-clients", "tab-more"]), `off: the five tabs as before (${off.join(", ")})`);
    h.expect(/^Сообщения$/.test((await tid("tab-messages").first().innerText()).trim()), "the tab says «Сообщения»");
    await h.go("/more");
    await tid("more-group-work").first().waitFor({ timeout: 8000 });
    h.expect((await tid("more-plan").count()) === 0, "off: no «План» tile in «Ещё» (it is a tab)");
  }

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await h.go("/today");
  if (wide) {
    await tid("side-module-gutters-list").first().waitFor({ timeout: 8000 }); // on: «Gutters» in the side menu
    h.expect((await tid("side-plan").count()) === 1, "on: «План» stays in the side menu");
    await h.shot("side");
    return;
  }
  await tid("tab-module-gutters-list").first().waitFor({ timeout: 8000 }); // on: the module's tab
  h.expect((await tid("tab-module-gutters-list").first().innerText()).trim() === "Gutters", "the module's tab is named «Gutters» (not «Замеры»)");
  const on = await tabIds();
  h.expect(JSON.stringify(on) === JSON.stringify(["tab-home", "tab-module-gutters-list", "tab-messages", "tab-clients", "tab-more"]), `on: five tabs, «Gutters» in the place of «План» (${on.join(", ")})`);
  await h.shot("tabs");
  // «План» went to «Ещё»: its tile opens the Plan, and the Plan lights «Ещё»
  await tid("tab-more").first().click();
  await tid("more-plan").first().waitFor({ timeout: 8000 });
  await h.shot("more");
  await tid("more-plan").first().click();
  await p.waitForURL(/\/plan/, { timeout: 8000 });
  // the Plan lights «Ещё»: waits on the tab's own state
  await p.locator('[data-testid="tab-more"][aria-selected="true"]').first().waitFor({ timeout: 8000 });
};
