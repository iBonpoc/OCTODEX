/**
 * e2e 186 — фото выезда на вебе после перезагрузки («Лиды и клиенты» №13, долг 4; как в модуле, e2e 149 / #384).
 * The web file picker gives a `blob:` of the open page; after a reload it is dead. The photo stays in the data, the tile
 * shows the picture sign, the page never asks for the dead address (no empty preview, no ERR_FILE_NOT_FOUND).
 * Every view. Waits on what it checks.
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

exports.run = async (h) => {
  const p = h.page;
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  await h.go("/today");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  const db = await h.db();
  const v0 = db.visits.find((v) => v.techId === db.me && v.step === "scheduled" && !v.photos.length);
  h.expect(!!v0, "a visit of mine without photos");
  await h.go(`/visit/${v0.id}`);
  await h.click("Я в пути");
  await h.click("На месте"); // the photos are on the work step
  const add = p.getByRole("button", { name: "Добавить фото" }).locator("visible=true").first();
  await add.waitFor({ timeout: 8000 });
  const [chooser] = await Promise.all([p.waitForEvent("filechooser"), add.click()]);
  await chooser.setFiles({ name: "before.png", mimeType: "image/png", buffer: PNG });
  const photo = async () => (await h.db()).visits.find((v) => v.id === v0.id)?.photos?.[0];
  await waitFor(async () => (await photo())?.uri?.startsWith("blob:"), "the photo is saved with this page's blob:");
  // this page's photo loads
  await waitFor(async () => (await p.locator('img[src^="blob:"]').count()) > 0, "this page's photo is shown");

  // record every image the page asks for, then reload
  await p.addInitScript(() => {
    const seen = (window.__imgSrc = []);
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    Object.defineProperty(HTMLImageElement.prototype, "src", { ...d, set(v) { seen.push(String(v)); d.set.call(this, v); } });
  });
  await p.waitForTimeout(1300); // the store saves the photo before the reload
  await p.reload();
  const tile = p.getByRole("button", { name: "Фото 1" }).locator("visible=true").first();
  await tile.waitFor({ timeout: 8000 });
  h.expect(!!(await photo()), "after a reload: the photo is still in the data");
  await p.waitForTimeout(500);
  h.expect((await p.evaluate(() => (window.__imgSrc || []).filter((u) => u.startsWith("blob:")).length)) === 0, "after a reload: the dead blob: is never loaded");
  h.expect((await tile.locator("img").count()) === 0, "after a reload: the tile shows the picture sign");
  await h.shot("after-reload");
  // the viewer too: the sign, not an empty picture; deleting still works
  await tile.click();
  await p.waitForTimeout(400);
  h.expect((await h.sheet().locator("img").count()) === 0, "the viewer shows the sign");
  h.expect((await p.evaluate(() => (window.__imgSrc || []).filter((u) => u.startsWith("blob:")).length)) === 0, "the viewer does not load it either");
  await h.sheet().getByRole("button", { name: "Удалить фото" }).click();
  await waitFor(async () => !(await photo()), "a dead photo can still be deleted");
};
