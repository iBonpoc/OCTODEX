/**
 * e2e 381 — #642 (Ф1 of #1083): a photo is made smaller before the app keeps it. A 4000×3000 picture picked on a visit
 * («Добавить фото»), by «Создать» → «Фото» and as an expense receipt is kept with the long side ≤ 2048 px, as a JPEG, and
 * much lighter than the picked file; a small picture is not made larger. Every view. Waits on what it checks.
 */
exports.run = async (h) => {
  const p = h.page;
  // waits in the page on the phone's copy of the data: the visit has n photos with an address
  const photosSaved = (id, n) =>
    p.waitForFunction(
      ([id, n]) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.visits?.find((v) => v.id === id)?.photos ?? []).filter((x) => x.uri).length >= n,
      [id, n],
      { timeout: 15000 },
    );
  // a picture with noise (so the JPEG cannot be tiny anyway): made in the page, given to the file chooser as bytes
  const picture = async (w, h0, type) =>
    Buffer.from(
      await p.evaluate(async ([w, h0, type]) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h0;
        const g = c.getContext("2d");
        const img = g.createImageData(w, h0);
        let s = 7;
        for (let i = 0; i < img.data.length; i += 4) {
          s = (s * 1103515245 + 12345) & 0x7fffffff;
          img.data[i] = (i / 4) % w / w * 255;
          img.data[i + 1] = (s >> 8) & 255;
          img.data[i + 2] = Math.floor(i / 4 / w) / h0 * 255;
          img.data[i + 3] = 255;
        }
        g.putImageData(img, 0, 0);
        const b = await new Promise((r) => c.toBlob(r, type, 0.95));
        const bytes = new Uint8Array(await b.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(bin);
      }, [w, h0, type]),
      "base64",
    );
  // what the app kept at an address: the pixel size, the type and the bytes
  const kept = (uri) =>
    p.evaluate(async (u) => {
      const b = await (await fetch(u)).blob();
      const bmp = await createImageBitmap(b);
      return { w: bmp.width, h: bmp.height, type: b.type, size: b.size };
    }, uri);
  const big = await picture(4000, 3000, "image/jpeg");
  const small = await picture(640, 480, "image/png");

  await h.seed("octo.role.v1", "tech");
  await h.go("/today");
  const db = await h.db();
  const v0 = db.visits.find((v) => v.techId === db.me && v.step === "scheduled" && !v.photos.length);
  h.expect(!!v0, "a visit of mine without photos");
  await h.go(`/visit/${v0.id}`);
  await h.click("Я в пути");
  await h.click("На месте");
  const add = p.getByRole("button", { name: "Добавить фото" }).locator("visible=true").first();
  await add.waitFor({ timeout: 8000 });
  const photos = async () => (await h.db()).visits.find((v) => v.id === v0.id)?.photos ?? [];

  // 1) the visit's «Добавить фото»: 4000×3000 → 2048×1536 JPEG
  const [ch1] = await Promise.all([p.waitForEvent("filechooser"), add.click()]);
  await ch1.setFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: big });
  await photosSaved(v0.id, 1);
  const k1 = await kept((await photos())[0].uri);
  h.expect(k1.w === 2048 && k1.h === 1536, `the long side is 2048, the aspect kept (${k1.w}×${k1.h})`);
  h.expect(k1.type === "image/jpeg", `kept as a JPEG (${k1.type})`);
  h.expect(k1.size < big.length / 2, `much lighter than the picked file (${k1.size} of ${big.length} bytes)`);
  await p.locator('[data-testid^="photo-thumb-"] img').locator("visible=true").first().waitFor({ timeout: 8000 });

  // 2) a small picture is not made larger (and a PNG is kept as a JPEG)
  const [ch2] = await Promise.all([p.waitForEvent("filechooser"), add.click()]);
  await ch2.setFiles({ name: "small.png", mimeType: "image/png", buffer: small });
  await photosSaved(v0.id, 2);
  const k2 = await kept((await photos())[1].uri);
  h.expect(k2.w === 640 && k2.h === 480, `a small photo keeps its size (${k2.w}×${k2.h})`);
  h.expect(k2.type === "image/jpeg", `a PNG is kept as a JPEG (${k2.type})`);

  // 3) «Создать» → «Фото»: the same
  await p.getByRole("button", { name: "Создать", exact: true }).locator("visible=true").last().click();
  const [ch3] = await Promise.all([p.waitForEvent("filechooser"), p.getByTestId("fab-photo").locator("visible=true").last().click()]);
  await ch3.setFiles({ name: "big2.jpg", mimeType: "image/jpeg", buffer: big });
  await photosSaved(v0.id, 3);
  const k3 = await kept((await photos())[2].uri);
  h.expect(Math.max(k3.w, k3.h) === 2048 && k3.type === "image/jpeg", `the «＋» photo is made smaller too (${k3.w}×${k3.h} ${k3.type})`);
  await h.shot("visit-photos");

  // 4) an expense receipt (as the director: «Расход» is the office's)
  await h.seed("octo.role.v1", "director");
  await h.go("/expense/new");
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await vis("field-amount").waitFor({ timeout: 8000 });
  const before = ((await h.db()).expenses ?? []).length;
  const [ch4] = await Promise.all([p.waitForEvent("filechooser"), p.getByRole("button", { name: "Фото чека" }).locator("visible=true").first().click()]);
  await ch4.setFiles({ name: "receipt.jpg", mimeType: "image/jpeg", buffer: big });
  await p.locator('img[src^="blob:"]').locator("visible=true").first().waitFor({ timeout: 8000 });
  await vis("field-amount").locator("input, textarea").first().fill("12.50");
  await vis("expense-save").click();
  await p.waitForURL((u) => !/\/expense\/new/.test(u.pathname), { timeout: 8000 });
  await p.waitForFunction((n) => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.expenses ?? []).length === n + 1, before, { timeout: 8000 });
  const exp = ((await h.db()).expenses ?? []).find((x) => x.receiptUri && !db.expenses.some((y) => y.id === x.id));
  h.expect(!!exp, "the new expense has its receipt");
  const k4 = await kept(exp.receiptUri);
  h.expect(Math.max(k4.w, k4.h) === 2048 && k4.type === "image/jpeg", `the receipt is made smaller (${k4.w}×${k4.h} ${k4.type})`);
};
