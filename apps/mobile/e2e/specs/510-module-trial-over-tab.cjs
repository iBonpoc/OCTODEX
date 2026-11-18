/**
 * e2e 510 — the module's tab never goes silently (founder 18.11.2026: «Почему у нас исчез модуль… вместо Gutters появилась
 * вкладка „План“»; the 7-day trial ran out). Every view.
 * - a company whose Gutters trial ran out a week ago, never paid (the stored row as the founder's phone had it): the tab is
 *   there — on the phone in the place of «План», at 820/1280 in the side menu; «План» does not take its place;
 * - the tab opens the list with «Пробный период закончился» and why (drafts open, nothing is saved), the director's
 *   «Подключить» leads to «Компания → Модули»; «Модули» says «Пробный период закончился» as before (the trial and the price stay);
 *   a tech sees the same words, without the button;
 * - switched off → the tab goes, «План» is back, «Модули» says «Отключён» (the only way the tab leaves).
 * The stored state is changed on a page where the app does not run (h.seed); waits on what it checks, by testID.
 */
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const tabId = wide ? "side-module-gutters-list" : "tab-module-gutters-list";
  // how many of the testID are seen; the status chip's words
  const seen = (id, n) =>
    p.waitForFunction(([i, want]) => [...document.querySelectorAll(`[data-testid="${i}"]`)].filter((e) => e.getClientRects().length).length === want, [id, n], { timeout: 8000 });
  const status = (re) =>
    p.waitForFunction((src) => {
      const e = [...document.querySelectorAll('[data-testid="module-gutters-status"]')].find((x) => x.getClientRects().length);
      return !!e && new RegExp(src).test((e.textContent || "").trim());
    }, re.source, { timeout: 8000 });
  const tabIds = () => tid("tab-bar").locator('[data-testid^="tab-"]').evaluateAll((xs) => xs.map((x) => x.getAttribute("data-testid")));

  // switched on once, then the stored row is made the founder's: the trial ran out a week ago, no payment
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await status(/^Пробный/);
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.trialEndsAt, KEY, { timeout: 8000 });
  await h.seed("e2e.510.left", 1); // off the app: it has written its own copy as it left
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const g = raw.db.company.modules.gutters;
  g.trialEndsAt = new Date(Date.now() - 7 * 86_400_000).toISOString();
  delete g.paidUntil;
  await h.seed(KEY, raw);
  await h.go("/today");
  await tid(wide ? "side-nav" : "tab-bar").waitFor({ timeout: 8000 });

  // the tab is there; «План» does not take its place
  await seen(tabId, 1).catch(() => h.expect(false, "the trial ran out a week ago: the module's tab is still there"));
  if (!wide) {
    const ids = await tabIds();
    h.expect(ids.includes("tab-module-gutters-list") && !ids.includes("tab-plan"), `the module's tab, not «План» (${ids.join(", ")})`);
  }
  await h.shot("tab");

  // the tab opens the list that says why
  await tid(tabId).click();
  await p.waitForURL((u) => u.pathname.endsWith("/module/gutters/list"), { timeout: 8000 });
  await tid("measurements-expired").waitFor({ timeout: 5000 });
  const said = await tid("measurements-expired").innerText();
  h.expect(/Пробный период закончился/.test(said) && /ничего не сохраняется/.test(said), `the screen says the trial is over and why (${said})`);
  await h.shot("expired");

  // a tech: the same words, no button
  await h.seed("octo.role.v1", "tech");
  await h.go("/module/gutters/list");
  await tid("measurements-expired").waitFor({ timeout: 5000 });
  h.expect((await tid("measurements-expired").getByRole("button").count()) === 0, "a tech: the words, no «Подключить»");
  await h.seed("octo.role.v1", "director");

  // the director: «Подключить» → «Компания → Модули», the trial over as before
  await h.go("/module/gutters/list");
  await tid("measurements-expired").getByRole("button").click();
  await p.waitForURL((u) => u.pathname.endsWith("/company/modules"), { timeout: 8000 });
  await status(/^Пробный период закончился$/).catch(() => h.expect(false, "«Модули»: «Пробный период закончился», as before"));

  // switched off: the tab goes, «План» is back; «Модули» says «Отключён»
  await tid("module-gutters-disable").getByRole("button").click();
  await status(/^Отключён$/).catch(() => h.expect(false, "switched off: «Отключён»"));
  await h.go("/today");
  await tid(wide ? "side-nav" : "tab-bar").waitFor({ timeout: 8000 });
  await seen(tabId, 0).catch(() => h.expect(false, "switched off: the module's tab goes"));
  if (!wide) {
    const ids = await tabIds();
    h.expect(ids.includes("tab-plan"), `switched off: «План» is back (${ids.join(", ")})`);
  }
};
