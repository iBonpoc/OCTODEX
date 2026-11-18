/**
 * e2e 454 — «Обновить» (#1912, DS §15.3а), every view. The web has no over-the-air update: no strip under the header, no «Версия · Проверить
 * обновление» row in Settings → «О приложении». The strip itself is shown in the showcase («Уведомления», `showcase-update-bar`): its words,
 * its «Обновить» answers, «Скрыть» is there. (Reload order, unsaved sheets and the queue are unit-tested: test/updateRules.test.ts; the native
 * part is checked on the iPhone — rule 27.)
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings");
  await vis("settings-about").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("update-row").count()) === 0, "the web has no «Проверить обновление» row");
  h.expect((await p.getByTestId("update-bar").count()) === 0, "the web has no update strip under the header");
  await h.go("/settings/design-system/notices");
  await vis("showcase-update-bar").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("update-bar").count()) === 0, "the showcase strip is the demo, not the real one");
  const text = (await vis("showcase-update-bar").innerText()).replace(/\s+/g, " ");
  h.expect(/Доступна новая версия/.test(text), `the strip says: ${text}`);
  h.expect(/перезапустится/.test(text) && /сохранятся/.test(text), `the strip says nothing is lost: ${text}`);
  await vis("showcase-update-bar-action").getByRole("button", { name: "Обновить" }).click();
  const last = (await vis("showcase-state-pressed").innerText()).replace(/\s+/g, " ").trim();
  h.expect(last === "Нажато: Обновить", `the action answers: ${last}`);
  await h.shot("update-bar");
};
