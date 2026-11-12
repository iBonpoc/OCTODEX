/**
 * #1193 п.6 (DS §15.2): «Отменить» takes back only its own action; when the thing was changed since, nothing is taken
 * back and the same toast says «Уже не отменить: это успели изменить». Shown live in the showcase («Уведомления»), every
 * view. The store's own rule (all or nothing): test/undoOwn.test.ts, test/undoOwnStore.test.ts.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system/notices");
  await vis("showcase-note-late").waitFor({ timeout: 5000 });
  await vis("showcase-note-late").getByRole("button").first().click();
  const undo = vis("toast-undo");
  await undo.waitFor({ timeout: 3000 });
  // the toast ignores a tap in its first moments (the second tap of a double tap): press until it answers
  for (let i = 0; i < 20 && (await p.getByText("Уже не отменить: это успели изменить").count()) === 0; i++) {
    if ((await undo.count()) === 0) break;
    await undo.click({ timeout: 1000 }).catch(() => {});
  }
  await h.expectText(/Уже не отменить: это успели изменить/, "the late undo says so");
  h.expect((await p.getByTestId("toast-undo").locator("visible=true").count()) === 0, "the new toast has no «Отменить» of its own");
  await h.shot("undo-late");
};
