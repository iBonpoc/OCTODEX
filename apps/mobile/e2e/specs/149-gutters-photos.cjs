/**
 * e2e 149 — фото к замеру и элементу (docs/specs/33-gutters-screens.md П21.10 M5d). Every view.
 * - the module off: the canvas offers no photos (founder О2: nothing is saved);
 * - the trial on: a drawn run, once saved → its attributes have «Фото элемента»: a photo goes to DB.files with the
 *   measurement and the run; the measurement's own photos (390: «Фото» in the top bar → a sheet; 820/1280: the side
 *   panel when nothing is picked) — with the measurement, without an element;
 * - removing a photo → «Отменить» brings it back; a reload keeps both;
 * - past the trial (founder О2: a draft opens for reading): both photos are shown, no «Добавить фото», no «Удалить».
 * - web: a photo picked before a reload (a dead blob:) is never loaded — the tile shows the picture sign (CI 08.11).
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
    await p.waitForTimeout(200);
  };
  const db = () => h.db();
  const photos = async () => ((await db())?.files ?? []).filter((f) => f.kind === "photo" && f.measurementId);
  const gutters = async () => (await db())?.moduleData?.gutters ?? { measurements: [], elements: [] };
  /** «Добавить фото» inside a block → the file picker of the browser */
  const addIn = async (block) => {
    const [chooser] = await Promise.all([p.waitForEvent("filechooser"), tid(block).getByRole("button", { name: "Добавить фото" }).click()]);
    await chooser.setFiles({ name: "house.png", mimeType: "image/png", buffer: PNG });
  };
  const drawRun = async () => {
    const b = await p.getByTestId("draw-surface").boundingBox();
    const y = b.y + b.height * 0.42;
    await stroke([b.x + b.width * 0.1, y], [b.x + b.width * 0.5, y]);
  };

  // the module off: no photos on the canvas
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await drawRun();
  await tid("draw-not-saved").waitFor({ timeout: 5000 });
  if (!wide) await tid("draw-props").getByRole("button").click();
  await tid("attr-panel").waitFor({ timeout: 5000 });
  await p.waitForTimeout(1300);
  h.expect((await tid("attr-photos").count()) === 0 && (await tid("draw-photos-open").count()) === 0 && (await tid("draw-photos").count()) === 0,
    "the module off: no photos offered");

  // the trial on, a run saved
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await drawRun();
  await waitFor(async () => (await gutters()).elements.length === 1, "the run is saved");
  const { measurements: [m], elements: [run] } = await gutters();

  // the run's photo
  if (!wide) await tid("draw-props").getByRole("button").click();
  await tid("attr-photos").waitFor({ timeout: 5000 });
  await addIn("attr-photos");
  await waitFor(async () => (await photos()).some((f) => f.measurementId === m.id && f.elementId === run.id), "a photo of the run: measurement and element");
  await waitFor(async () => /Фото элемента · 1/.test(await tid("attr-photos").innerText()), "the run shows 1 photo");
  await h.shot("element");

  // the measurement's photo
  if (wide) await tid("draw-panel-close").getByRole("button").click();
  else {
    await p.getByRole("button", { name: "Закрыть", exact: true }).first().click({ position: { x: 10, y: 10 } });
    await waitFor(async () => (await tid("attr-panel").count()) === 0, "the sheet closed");
    await tid("draw-photos-open").getByRole("button").click();
  }
  await tid("draw-photos").waitFor({ timeout: 5000 });
  await addIn("draw-photos");
  await waitFor(async () => (await photos()).some((f) => f.measurementId === m.id && !f.elementId), "a photo of the measurement: no element");
  await waitFor(async () => /Фото замера · 1/.test(await tid("draw-photos").innerText()), "the measurement shows 1 photo");
  await h.shot("measurement");

  // remove → «Отменить»
  const ownId = (await photos()).find((f) => !f.elementId).id;
  await tid("draw-photos").getByRole("button", { name: "Фото 1" }).click();
  await p.getByRole("button", { name: "Удалить фото" }).click();
  await waitFor(async () => !(await photos()).some((f) => f.id === ownId), "removed");
  await p.waitForTimeout(400); // the toast ignores a press in its first 300 ms
  await p.getByRole("button", { name: "Отменить" }).last().click();
  await waitFor(async () => (await photos()).some((f) => f.id === ownId), "«Отменить» brings it back");

  // a reload keeps both. On the web a picked photo is a blob: of this page — dead after a reload: the screen must not
  // try to load it (an empty preview and «ERR_FILE_NOT_FOUND», CI 08.11 #378/#380). Every image the page asks for is
  // recorded, so the check never depends on whether the browser got round to logging the failure.
  await p.addInitScript(() => {
    const seen = (window.__imgSrc = []);
    const d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
    Object.defineProperty(HTMLImageElement.prototype, "src", { ...d, set(v) { seen.push(String(v)); d.set.call(this, v); } });
  });
  await p.waitForTimeout(1300);
  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await photos()).filter((f) => f.measurementId === m.id).length === 2, "after a reload: both photos");
  if (!wide) await tid("draw-photos-open").getByRole("button").click();
  await waitFor(async () => (await tid("draw-photos").count()) === 1 && /Фото замера · 1/.test(await tid("draw-photos").innerText()), "after a reload: the measurement shows its photo");
  await p.waitForTimeout(500);
  h.expect((await p.evaluate(() => (window.__imgSrc || []).filter((u) => u.startsWith("blob:")).length)) === 0, "after a reload: no dead blob: of the last page is loaded");

  // past the trial: the photos are shown, read only (M5e)
  await p.waitForTimeout(600); // the phone's copy is written with a pause: let it land before editing it
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.company.modules.gutters.trialEndsAt = new Date(Date.now() - 86_400_000).toISOString();
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go(`/module/gutters/draw?m=${m.id}`);
  await tid("draw-not-saved").waitFor({ timeout: 8000 });
  if (!wide) await tid("draw-photos-open").getByRole("button").click();
  await tid("draw-photos").waitFor({ timeout: 5000 });
  h.expect(/Фото замера · 1/.test(await tid("draw-photos").innerText()), "past the trial: the measurement's photo is shown");
  h.expect((await tid("draw-photos").getByRole("button", { name: "Добавить фото" }).count()) === 0, "…and nothing can be added");
  await tid("draw-photos").getByRole("button", { name: "Фото 1" }).click();
  await p.waitForTimeout(400);
  h.expect((await p.getByRole("button", { name: "Удалить фото" }).count()) === 0, "…nor removed");
  await h.shot("read-only");
};
