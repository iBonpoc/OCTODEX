/**
 * e2e 150 — настройки модуля Gutters у компании (docs/specs/33-gutters-settings.md П22 M7b; S0b). Every view.
 * - director, the trial on: «Компания → Модули → Gutters → Настройки» → the page; «Что ставим» — «Box» unchecked;
 *   the palette — «Berger (8)» replaces the list (Natural Clay first); the default run colour — Black;
 *   all of it in the store (company.modules.gutters.settings) and back after a reload;
 * - the canvas: a new run is Black, the panel offers no «Box», the colours are Berger's;
 * - the last choice of a list cannot be unchecked (the list stays);
 * - the office (dispatcher): the page read-only — «ask the owner», no «Добавить».
 * Finds things by testID; waits on what it checks.
 */
const KEY = "octo.db.v5";
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const settings = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.settings) || {}, KEY);
  const box = (field, name) => tid(field).getByRole("checkbox", { name, exact: true });
  const chosen = (field) => tid(field).locator('[aria-checked="true"]').innerText();
  const radio = (field, name) => tid(field).getByRole("radio", { name, exact: true });

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await tid("module-gutters-settings").getByRole("button").click();
  await p.waitForURL(/\/module\/gutters\/settings$/, { timeout: 5000 });
  await tid("gset-screen").waitFor({ timeout: 5000 });
  h.expect((await tid("gset-ro").count()) === 0 && (await tid("gset-locked").count()) === 0, "the director in the trial changes them");
  await h.shot("top");

  // what we install: no box gutters
  // MultiChips: a checked chip says «✓» (its checked state is not an attribute on the web)
  const on = async (field, name) => (await box(field, name).innerText()).trim().startsWith("✓");
  h.expect(await on("gset-profiles", "Box"), "Box is installed by default");
  await box("gset-profiles", "Box").click();
  await waitFor(async () => { const s = await settings(); return Array.isArray(s.offer?.profiles) && !s.offer.profiles.includes("box"); }, "Box unchecked is saved");
  h.expect(!(await on("gset-profiles", "Box")) && (await tid("gset-sizes-box").count()) === 0, "Box unchecked, no sizes of a profile we do not install");

  // the last size of fascia stays
  await box("gset-sizes-fascia", "7″").click();
  await waitFor(async () => { const s = await settings(); return Array.isArray(s.offer?.sizes?.fascia) && s.offer.sizes.fascia.join() === "6"; }, "fascia 7″ unchecked");
  await box("gset-sizes-fascia", "6″").click();
  await h.expectText(/Оставьте хотя бы один вариант/, "the last choice stays — said why");
  h.expect((await settings()).offer.sizes.fascia.join() === "6", "fascia keeps 6″");

  // the palette: Berger's
  await tid("gset-palette-berger").scrollIntoViewIfNeeded();
  await tid("gset-palette-berger").getByRole("button").click();
  await waitFor(async () => ((await settings()).palette || []).length === 8, "Berger's 8 colours saved");
  h.expect((await tid("gset-color-0").innerText()).trim() === "Natural Clay", "Natural Clay first");
  // the default run colour
  await radio("gset-run-color", "Black").scrollIntoViewIfNeeded();
  await radio("gset-run-color", "Black").click();
  await waitFor(async () => (await settings()).run?.color === "Black", "Black is the new run's colour");
  await h.shot("palette");

  // back after a reload
  await h.go("/module/gutters/settings");
  await tid("gset-screen").waitFor({ timeout: 5000 });
  h.expect((await tid("gset-color-0").innerText()).trim() === "Natural Clay", "the palette is there after a reload");
  h.expect((await chosen("gset-run-color")) === "Black", "the default colour is there after a reload");

  // the canvas follows
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  const a0 = [b.x + b.width * 0.08, y];
  const a1 = [b.x + b.width * 0.45, y];
  await p.mouse.move(a0[0], a0[1]);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(a0[0] + ((a1[0] - a0[0]) * i) / 12, y);
  await p.mouse.up();
  await waitFor(async () => (await p.getByTestId("draw-svg").first().locator("line:not([id^=halo])").count()) === 1, "one run");
  if (!wide) await tid("draw-props").getByRole("button").click();
  await tid("attr-panel").waitFor({ timeout: 5000 });
  h.expect((await chosen("attr-color")) === "Black", "a new run is the company's Black");
  h.expect((await radio("attr-profile", "Box").count()) === 0, "no Box on the panel");
  h.expect((await radio("attr-color", "Natural Clay").count()) === 1, "Berger's colours on the panel");
  await h.shot("canvas");

  // the office: read only
  await setRole(h, "dispatcher");
  await h.go("/module/gutters/settings");
  await tid("gset-screen").waitFor({ timeout: 5000 });
  await tid("gset-ro").waitFor({ timeout: 5000 });
  h.expect((await tid("gset-color-add").count()) === 0 && (await tid("gset-palette-berger").count()) === 0, "the office adds no colours");
  h.expect((await box("gset-profiles", "K").isDisabled()), "the office cannot uncheck");
  await h.shot("office");
};
