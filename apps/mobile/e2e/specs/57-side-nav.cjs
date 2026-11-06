/**
 * Wave 2b of the app shell (docs/specs/13 §2.5, 13а §8): the side menu on 820 and 1280.
 * - 390: no side menu, the bottom tabs, no ☰ (variant Б: «Ещё» is a tab);
 * - 820: the rail (icons with labels) always on screen, ☰ on it opens the full menu over the content;
 * - 1280: the rail by default; ☰ opens the full menu in place and pushes the content; it is remembered after a reload;
 *   ☰ again folds it back;
 * - a rail item opens its section and is marked; no top pill; no horizontal scroll; no menu on the client page /p.
 */
exports.run = async (h) => {
  const p = h.page;
  const w = h.layout.width;
  const nav = () => p.getByTestId("side-nav");
  const toggle = () => p.getByTestId("side-toggle");
  const box = async (l) => (await l.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const noOverflow = async (where) =>
    h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${where}: no horizontal scroll at ${w}`);

  await h.go("/today");
  if (w < 820) {
    h.expect((await nav().count()) === 0, "390: no side menu");
    h.expect((await p.getByRole("tab", { name: "Главная", exact: true }).count()) === 1, "390: the bottom tabs");
    h.expect((await p.getByRole("button", { name: "Меню", exact: true }).locator("visible=true").count()) === 0, "390: no ☰ in the header (variant Б)");
    return;
  }

  // the rail: on the left, 72 wide, no top pill and no bottom tabs
  const rail = await box(nav());
  h.expect(rail.x === 0 && Math.round(rail.width) === 72, `the rail on the left, 72 wide (${rail.x}, ${rail.width})`);
  for (const name of ["Главная", "План", "Сообщения", "Звонки", "Клиенты"])
    h.expect((await p.getByRole("tab", { name, exact: true }).locator("visible=true").count()) === 0, `no bottom/top tab «${name}» on 820/1280`);
  const title = await box(p.locator('[role="heading"][aria-level="1"]:visible').first());
  h.expect(title.x >= rail.width, `the screen starts right of the rail (${title.x})`);
  h.expect(await p.getByTestId("side-home").getAttribute("aria-current") === "page", "Home marked on Today");
  await noOverflow("/today");
  await h.shot("rail");

  // a rail item opens its section and is marked
  await p.getByTestId("side-jobs").click();
  await p.waitForTimeout(700);
  h.expect(new URL(p.url()).pathname === "/jobs", `rail → Jobs (${p.url()})`);
  h.expect(await p.getByTestId("side-jobs").getAttribute("aria-current") === "page", "Jobs marked");
  h.expect((await p.getByTestId("side-home").getAttribute("aria-current")) !== "page", "Home no longer marked");

  if (w < 1280) {
    // 820: ☰ opens the full menu over the content; the content does not move
    const before = await box(p.locator('[role="heading"][aria-level="1"]:visible').first());
    await toggle().click();
    const drawer = p.getByRole("dialog", { name: "Меню" });
    await drawer.waitFor({ timeout: 3000 });
    h.expect(/Документы/.test(await drawer.innerText()), "820: the full menu with its groups");
    const after = await box(p.locator('[role="heading"][aria-level="1"]:visible').first());
    h.expect(Math.abs(after.x - before.x) < 2, "820: the content stays where it was");
    await h.shot("tablet-open");
    await drawer.getByRole("button", { name: "Закрыть", exact: true }).click();
    await p.waitForTimeout(400);
    h.expect(Math.round((await box(nav())).width) === 72, "820: still the rail");
  } else {
    // 1280: ☰ opens the menu in place (232) and pushes the content
    const before = await box(p.locator('[role="heading"][aria-level="1"]:visible').first());
    h.expect((await toggle().getAttribute("aria-expanded")) !== "true" && Math.round((await box(nav())).width) === 72, "1280: folded by default");
    await toggle().click();
    await p.waitForTimeout(500);
    h.expect(Math.round((await box(nav())).width) === 232, `1280: the open menu is 232 (${(await box(nav())).width})`);
    h.expect((await toggle().getAttribute("aria-expanded")) === "true", "1280: ☰ says expanded");
    const after = await box(p.locator('[role="heading"][aria-level="1"]:visible').first());
    h.expect(after.x >= 232, `1280: the content moved right of the open menu (${after.x} vs ${before.x})`);
    h.expect(/Документы/.test(await nav().innerText()) && (await p.getByRole("dialog", { name: "Меню" }).count()) === 0, "1280: groups in place, no drawer");
    await noOverflow("/jobs open menu");
    await h.shot("desktop-open");
    // remembered after a reload
    await h.go("/today");
    h.expect(Math.round((await box(nav())).width) === 232, "1280: still open after a reload");
    // ☰ again folds it
    await toggle().click();
    await p.waitForTimeout(500);
    h.expect(Math.round((await box(nav())).width) === 72, "1280: folded back to the rail");
    await h.go("/today");
    h.expect(Math.round((await box(nav())).width) === 72, "1280: folded is remembered too");
  }

  // «＋ Создать» on the rail opens the quick actions
  await p.getByRole("button", { name: "Создать", exact: true }).locator("visible=true").first().click();
  await h.expectText(/Быстрые действия/, "«＋ Создать» on the rail");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);

  // the client page and sign-in: no staff menu
  await h.go("/p/demo0handyman0estimate0000000001");
  h.expect((await nav().count()) === 0, "no side menu on the client page");
  await noOverflow("/p");
};
