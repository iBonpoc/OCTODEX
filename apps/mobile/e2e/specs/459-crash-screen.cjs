/**
 * e2e 459 — the crash screen (#1555, DS §13.1), every view: it is drawn in the showcase («Уведомления»), with its words and both buttons;
 * each button answers. The root's ErrorBoundary itself (outside every provider, on a real failure) is checked by test/crashScreen.test.ts
 * and on the phone (rule 27).
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system/notices");
  await vis("showcase-crash").waitFor({ timeout: 8000 });
  const text = (await vis("crash-view").innerText()).replace(/\s+/g, " ");
  h.expect(/Приложение остановилось/.test(text), `says: ${text}`);
  h.expect(/неотправленные изменения целы/.test(text), `says nothing is lost: ${text}`);
  await vis("crash-retry").getByRole("button", { name: "Повторить" }).click();
  const last = async () => (await vis("showcase-state-pressed").innerText()).replace(/\s+/g, " ").trim();
  h.expect((await last()) === "Нажато: Повторить", `retry answers: ${await last()}`);
  await vis("crash-restart").getByRole("button", { name: "Перезапустить" }).click();
  h.expect((await last()) === "Нажато: Перезапустить", `restart answers: ${await last()}`);
  await h.shot("crash");
};
