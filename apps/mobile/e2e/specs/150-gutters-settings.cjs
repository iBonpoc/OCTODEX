/**
 * e2e 150 — настройки модуля Gutters у компании (docs/specs/33-gutters-settings.md П22 M7b; S0b). Every view.
 * - director, the trial on: «Компания → Модули → Gutters → Настройки» → the page; «Что ставим» — Box off, saved as «not
 *   installed» only; «Отменить» brings it back (store and page), off again; fascia 7″ off, then 6″ — refused, said under
 *   the field, nothing saved;
 * - the palette — Berger's replaces the list; the default run colour — the palette's 5th (Black); back after a reload;
 * - the canvas: a new run has the company's colour, the panel offers no Box and the palette's colours;
 * - offline (the demo's «no network»): a change is saved on the phone and waits in the queue (the badge);
 * - the trial over: read only, «Подключить» for the director;
 * - the office (dispatcher): read only, «ask the owner».
 * Finds things by testID and the store; waits on what it checks (the toast's «Отменить» has no testID — by its name).
 */
const KEY = "octo.db.v5";
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
/** an in-app move: a full load would put the demo back online */
const goInApp = (p, path) => p.evaluate((x) => { window.history.pushState({}, "", x); window.dispatchEvent(new PopStateEvent("popstate")); }, path);

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  // 390: what is changed seldom sits under «Ещё» (spec 33 П20.9) — open it; 820/1280 show every field
  const more = async () => {
    if (await tid("attr-more").count()) {
      await tid("attr-more").getByRole("button").click();
      await tid("attr-more-open").waitFor({ timeout: 5000 });
    }
  };
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {}, KEY);
  const mod = async () => ((await db()).company?.modules?.gutters) || {};
  const settings = async () => (await mod()).settings || {};
  const off = async (group, sub) => { const o = (await settings()).off || {}; const v = sub ? (o[group] || {})[sub] : o[group]; return Array.isArray(v) ? v : []; };
  const checked = async (id) => (await tid(id).getAttribute("aria-checked")) === "true";
  const radios = (field) => tid(field).getByRole("radio");

  await h.go("/today");
  await setRole(h, "director");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => !!(await mod()).trialEndsAt, "trial on");
  await tid("module-gutters-settings").getByRole("button").click();
  await p.waitForURL(/\/module\/gutters\/settings$/, { timeout: 5000 });
  await tid("gset-screen").waitFor({ timeout: 5000 });
  h.expect((await tid("gset-ro").count()) === 0 && (await tid("gset-locked").count()) === 0, "the director in the trial changes them");
  await h.shot("top");

  // what we install: Box off — stored as «not installed», nothing else
  h.expect(await checked("gset-profiles-box"), "Box is installed by default");
  await tid("gset-profiles-box").click();
  await waitFor(async () => (await off("profiles")).join() === "box", "Box off is saved as «not installed» only");
  h.expect(!(await checked("gset-profiles-box")) && (await tid("gset-sizes-box").count()) === 0, "Box off, no sizes of it");
  // «Отменить» (rule 5): back in the store and on the page
  await p.getByRole("button", { name: "Отменить", exact: true }).last().click();
  await waitFor(async () => (await off("profiles")).length === 0 && (await checked("gset-profiles-box")), "«Отменить»: Box is back");
  await tid("gset-profiles-box").click();
  await waitFor(async () => (await off("profiles")).join() === "box", "Box off again");

  // the last size of fascia stays: refused under the field, nothing saved
  await tid("gset-sizes-fascia-7").click();
  await waitFor(async () => (await off("sizes", "fascia")).join() === "7", "fascia 7″ off");
  await tid("gset-sizes-fascia-6").click();
  await tid("gset-sizes-fascia-warn").waitFor({ timeout: 3000 });
  h.expect((await off("sizes", "fascia")).join() === "7" && (await checked("gset-sizes-fascia-6")), "fascia keeps 6″");

  // the palette: Berger's; the default run colour — its 5th
  await tid("gset-palette-berger").scrollIntoViewIfNeeded();
  await tid("gset-palette-berger").getByRole("button").click();
  await waitFor(async () => ((await settings()).palette || []).length === 8, "Berger's 8 colours saved");
  const pal = (await settings()).palette;
  h.expect((await tid("gset-color-0").innerText()).trim() === pal[0], "the palette is on the page");
  await radios("gset-run-color").nth(4).scrollIntoViewIfNeeded();
  await radios("gset-run-color").nth(4).click();
  await waitFor(async () => (await settings()).run?.color === pal[4], "the 5th colour is the new run's");
  h.expect(JSON.stringify(Object.keys((await settings()).run)) === '["color"]', "only the colour of the default is stored");
  await h.shot("palette");

  // back after a reload
  await h.go("/module/gutters/settings");
  await tid("gset-screen").waitFor({ timeout: 5000 });
  h.expect((await tid("gset-color-7").count()) === 1 && (await tid("gset-color-8").count()) === 0, "8 colours after a reload");
  h.expect((await radios("gset-run-color").nth(4).getAttribute("aria-checked")) === "true", "the default colour after a reload");

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
  await waitFor(async () => (((await db()).moduleData?.gutters?.elements) || []).some((e) => e.kind === "run" && e.attrs.color === pal[4]), "a new run has the company's colour");
  if (!wide) await tid("draw-props").getByRole("button").click();
  await tid("attr-panel").waitFor({ timeout: 5000 });
  await more();
  h.expect((await radios("attr-profile").count()) === 4, "the panel offers 4 profiles (no Box)");
  h.expect((await radios("attr-color").count()) === 8, "the panel offers the palette's 8 colours");
  await h.shot("canvas");

  // offline: saved on the phone, waits in the queue
  await h.go("/settings");
  await p.getByRole("switch", { name: "Проверка: режим без сети" }).click();
  await goInApp(p, "/module/gutters/settings");
  await tid("gset-screen").waitFor({ timeout: 5000 });
  await tid("gset-profiles-euro").click();
  await waitFor(async () => (await off("profiles")).includes("euro"), "offline: saved on the phone");
  await tid("sync-badge").first().waitFor({ timeout: 5000 });
  h.expect(/\d/.test((await tid("sync-badge").first().getAttribute("aria-label")) || ""), "offline: the change waits in the queue");

  // the trial over: read only, «Подключить» for the director
  await h.go("/today");
  await p.evaluate((k) => {
    const raw = JSON.parse(localStorage.getItem(k));
    raw.db.company.modules.gutters.trialEndsAt = new Date(Date.now() - 86_400_000).toISOString();
    localStorage.setItem(k, JSON.stringify(raw));
  }, KEY);
  await h.go("/module/gutters/settings");
  await tid("gset-locked").waitFor({ timeout: 5000 });
  await tid("gset-connect").waitFor({ timeout: 3000 });
  h.expect((await tid("gset-color-add").count()) === 0, "the trial over: nothing to add");
  await tid("gset-profiles-k").click({ force: true });
  await p.waitForTimeout(400);
  h.expect(!(await off("profiles")).includes("k"), "the trial over: nothing saved");
  await h.shot("locked");

  // the office: read only (the role is switched on a plain page: a module page writes the app's state as it leaves)
  await h.go("/today");
  await setRole(h, "dispatcher");
  await p.evaluate((k) => {
    const raw = JSON.parse(localStorage.getItem(k));
    raw.db.company.modules.gutters.trialEndsAt = new Date(Date.now() + 86_400_000).toISOString();
    localStorage.setItem(k, JSON.stringify(raw));
  }, KEY);
  await h.go("/module/gutters/settings");
  await tid("gset-ro").waitFor({ timeout: 5000 });
  h.expect((await tid("gset-color-add").count()) === 0 && (await tid("gset-palette-berger").count()) === 0 && (await tid("gset-connect").count()) === 0, "the office adds no colours");
  await tid("gset-profiles-k").click({ force: true });
  await p.waitForTimeout(400);
  h.expect(!(await off("profiles")).includes("k"), "the office cannot uncheck");
  await h.shot("office");
};
