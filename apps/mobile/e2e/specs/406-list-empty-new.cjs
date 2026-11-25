/**
 * e2e 406 — an empty list offers its «＋ <object>» in the middle too (#1395, DS §12.2), the director, every view, by testID:
 * - «Клиенты» with no client: the header «＋ Клиент» and the same button in the empty card → the new client form;
 * - «Сообщения» with no conversation: the header «＋ Сообщение» and the empty card's button → the «Кому» sheet.
 * Nothing floats on either list.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true");
  // emptied from a page without the app (h.seed): the running app would write its own state back on pagehide
  const wipe = async (what) => {
    const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
    raw.db[what] = [];
    await h.seed("octo.db.v5", raw);
    await h.seed("octo.role.v1", "director");
  };

  await h.go("/today");
  await wipe("customers");
  await h.go("/clients");
  await vis("clients-empty-new").waitFor({ timeout: 8000 });
  // v2 (#2350): «Клиенты» is a ListScreen — its header «＋» is `clients-create`
  h.expect((await vis("clients-create").count()) === 1 && (await vis("fab").count()) === 0, "clients: «＋» in the header, none floating");
  await h.shot("clients-empty");
  await vis("clients-empty-new").click();
  await p.waitForURL(/\/client\/edit/, { timeout: 5000 });

  await h.go("/today");
  await wipe("activities");
  await h.go("/messages");
  await vis("messages-empty-new").waitFor({ timeout: 8000 });
  h.expect((await vis("fab-header").count()) === 1 && (await vis("fab").count()) === 0, "messages: «＋» in the header, none floating");
  await h.shot("messages-empty");
  await vis("messages-empty-new").click();
  await p.locator('[aria-modal="true"]').last().waitFor({ timeout: 5000 });
  h.expect((await h.sheet().getByTestId("msg-people").count()) > 0, "the empty card's button opens «Кому»");
};
