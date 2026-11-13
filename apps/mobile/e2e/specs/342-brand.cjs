/**
 * e2e 342 — GoRix in the app (DS §18.2, #1156, #654, #1046), every view, by testID:
 * - an address the app does not have: «Страницы нет» with the GR mark (its dot ink: the screen has a yellow button) and «На главную» — no silent redirect;
 * - Настройки → «О приложении»: the logo and «Версия … · сборка …»;
 * - from 820 the side menu has the mark on top, it opens Настройки; the phone has no side menu, so no mark;
 * - the showcase section «Бренд»: the marks, the logo, the three moves (still: e2e run with reduced motion);
 * - the page before the JS has the mark and the theme's background, not a white page.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const wide = h.layout.width >= 820;

  // «Страницы нет»
  await h.go("/zzz-no-such-page");
  await vis("page-not-found-mark").waitFor({ timeout: 8000 });
  const body = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  h.expect(/Страницы нет/.test(body), "says «Страницы нет»");
  h.expect(p.url().includes("/zzz-no-such-page"), "no silent redirect");
  // the dot is ink here (one yellow on the screen: «На главную»)
  const fills = await vis("page-not-found-mark").evaluate((el) => [...el.querySelectorAll("circle")].map((c) => c.getAttribute("fill")));
  h.expect(fills.length >= 1 && fills.every((f) => f && f.toUpperCase() !== "#FBFF00"), `the mark's dot is not yellow next to a yellow button (${fills.join(",")})`);
  await h.shot("not-found");
  await vis("page-not-found-home").getByRole("button").click();
  await p.waitForURL((u) => !u.pathname.includes("zzz-no-such-page"), { timeout: 8000 });

  // «О приложении»
  await h.go("/settings");
  await vis("about-brand").waitFor({ timeout: 8000 });
  h.expect(/Версия \d+\.\d+\.\d+ · сборка/.test(await vis("about-brand").innerText()), "the version and the build under the logo");
  await vis("about-brand").scrollIntoViewIfNeeded();
  await h.shot("about");

  // the side menu's mark
  if (wide) {
    await h.go("/today");
    await vis("side-brand").waitFor({ timeout: 5000 });
    await h.shot("side");
    await vis("side-brand").click();
    await p.waitForURL((u) => u.pathname === "/settings", { timeout: 8000 });
  } else {
    h.expect((await p.getByTestId("side-brand").count()) === 0, "the phone: no side menu, no mark");
  }

  // the showcase
  await h.go("/settings/design-system/brand");
  for (const id of ["showcase-brand-mark-24", "showcase-brand-mark-48", "showcase-brand-logo", "showcase-brand-quick", "showcase-brand-wait", "showcase-brand-intro"]) {
    await vis(id).waitFor({ timeout: 5000 });
  }
  await vis("showcase-brand-replay").getByRole("button").click();
  await vis("showcase-brand-intro").waitFor({ timeout: 3000 });
  await h.shot("showcase");
  await h.go("/settings/design-system");
  await vis("showcase-row-brand").waitFor({ timeout: 5000 });

  // the boot layer ran and left (#1046): the first launch marked the intro as shown for this version; with the app up
  // nothing of it stays under the shell (no loop behind the app)
  const seen = await p.evaluate(() => localStorage.getItem("octo.brand.seen.v1"));
  h.expect(/^"?\d+\.\d+\.\d+"?$/.test(seen || ""), `the intro is marked as shown for this version (${seen})`);
  for (const id of ["boot-brand", "boot-still", "boot-intro", "boot-quick", "boot-wait"]) h.expect((await p.getByTestId(id).count()) === 0, `${id}: gone once the app is up`);

  // before the JS: the HTML already has the mark on the theme's background (#1046 — never a white page)
  const html = await (await p.request.get(new URL("/", p.url()).toString())).text();
  h.expect(/id="gx-boot"/.test(html) && /viewBox="16 -736 1403 764"/.test(html), "index.html carries the GR mark before the JS");
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  h.expect(bg !== "rgb(255, 255, 255)" && bg !== "rgba(0, 0, 0, 0)", `the page's background is the theme's, not white (${bg})`);
};
