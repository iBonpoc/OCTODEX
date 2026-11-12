/**
 * e2e 305 — значок над подписью: подпись по центру (#1166, основатель 12.11, «Добавить фото»), every view.
 * The add-photo tile: the icon is in the middle of the tile and so is the caption (a two-line caption must not sit at the left).
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const db = await h.db();
  const v0 = db.visits.find((v) => v.techId === db.me && v.step === "scheduled" && !v.photos.length);
  h.expect(!!v0, "a visit of mine without photos");
  await h.go(`/visit/${v0.id}`);
  await h.click("Я в пути");
  await h.click("На месте");
  const tile = p.getByRole("button", { name: "Добавить фото" }).locator("visible=true").first();
  await tile.waitFor({ timeout: 5000 });
  const tb = await tile.boundingBox();
  // the caption: the text node inside the tile; its box and its text-align
  const cap = tile.locator("div").filter({ hasText: /^Добавить\s*фото$/ }).last();
  const align = await cap.evaluate((e) => getComputedStyle(e).textAlign);
  h.expect(align === "center", `the caption is text-align center (${align})`);
  const cb = await cap.boundingBox();
  const iconBox = await tile.locator("svg").first().boundingBox();
  const mid = (b) => b.x + b.width / 2;
  h.expect(Math.abs(mid(cb) - mid(tb)) <= 2, `the caption box is centred in the tile (${mid(cb).toFixed(1)} vs ${mid(tb).toFixed(1)})`);
  h.expect(Math.abs(mid(iconBox) - mid(tb)) <= 2, `the icon is centred in the tile (${mid(iconBox).toFixed(1)} vs ${mid(tb).toFixed(1)})`);
  await h.shot("add-photo-tile");
};
