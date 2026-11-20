/**
 * e2e 510 — «Графит», пилот витрины (#2254), not a rule. Every view, by testID:
 * С1 the section is hidden behind the switch (off by default; its address goes back to the list);
 * С2 the switch in the showcase turns it on and the device remembers it;
 * С3 the pilot screen: the «Прожектор» beam goes to the pressed tab, «＋» does not move it;
 * С4 the ½ sheet opens from «＋» and the secondary button, closes by the dim and by the close button;
 * С5 the phone field masks (626) 555-0142 and shows its error with icon + word;
 * С6 deleting a row shows the «Вернуть» toast, pressing it brings the row back;
 * С7 the theme switch of the pilot changes the scene; yellow fill only on the main button and «＋».
 */
const YELLOW = "rgb(251, 255, 0)";

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  /** a wait that says which step it was on when it fails */
  const until = async (label, fn, arg) => {
    try {
      await p.waitForFunction(fn, arg, { timeout: 8000 });
    } catch (e) {
      throw new Error(`${label}: ${e.message.split("\n")[0]}`);
    }
  };

  // С1 — hidden by default
  await h.go("/settings/design-system");
  await vis("showcase-sections").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("showcase-row-graphite").count()) === 0, "С1: no pilot row while the switch is off");
  await h.go("/settings/design-system/graphite");
  await vis("showcase-sections").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("showcase-graphite").count()) === 0, "С1: the pilot's address goes back to the list");

  // С2 — the switch turns it on, the device remembers
  await vis("showcase-graphite-flag").click();
  await vis("showcase-row-graphite").waitFor({ timeout: 4000 });
  await h.go("/settings/design-system");
  await vis("showcase-row-graphite").waitFor({ timeout: 8000 });
  await vis("showcase-row-graphite").click();
  await vis("showcase-graphite").waitFor({ timeout: 20000 }); // the sheet draws its sections after the fonts (#2286 flake)
  await p.getByTestId("gr-open").locator("visible=true").first().click();
  await vis("gr-screen").waitFor({ timeout: 15000 });

  // С3 — the beam over the pressed tab; «＋» keeps it
  const centreX = async (id) => {
    const b = await vis(id).boundingBox();
    return b.x + b.width / 2;
  };
  const beamOver = async (id) => Math.abs((await centreX("gr-nav-beam")) - (await centreX(id))) < 4;
  // an `until`, not a single look (#2286): the nav's width reaches the beam a moment after the screen shows
  await until("С3 beam over today", () => {
    const c = (s) => {
      const r = document.querySelector(`[data-testid="${s}"]`)?.getBoundingClientRect();
      return r ? r.x + r.width / 2 : -1;
    };
    return Math.abs(c("gr-nav-beam") - c("gr-nav-today")) < 4;
  });
  await vis("gr-nav-clients").click();
  await until("С3 clients selected", () => document.querySelector('[data-testid="gr-nav-clients"]')?.getAttribute("aria-selected") === "true");
  await until("С3 beam over clients", () => {
    const c = (s) => {
      const r = document.querySelector(`[data-testid="${s}"]`)?.getBoundingClientRect();
      return r ? r.x + r.width / 2 : -1;
    };
    return Math.abs(c("gr-nav-beam") - c("gr-nav-clients")) < 4;
  });
  h.expect((await vis("gr-nav-today").getAttribute("aria-selected")) !== "true", "С3: one tab is selected");
  await h.shot("beam-clients");

  // С4 — the ½ sheet: from «＋», closes by the dim; from the secondary button, closes by its button
  await vis("gr-nav-plus").click();
  await vis("gr-sheet").waitFor({ timeout: 4000 });
  h.expect(await beamOver("gr-nav-clients"), "С3: «＋» does not move the beam");
  await until("С4 sheet at ½", () => {
    const r = document.querySelector('[data-testid="gr-sheet"]')?.getBoundingClientRect();
    return r && Math.abs(r.height - Math.round(window.innerHeight / 2)) <= 2;
  });
  await h.shot("sheet-half");
  await vis("gr-sheet-scrim").click({ position: { x: 20, y: 20 } });
  await p.getByTestId("gr-sheet").waitFor({ state: "detached", timeout: 4000 });
  await vis("gr-secondary").click();
  await vis("gr-sheet").waitFor({ timeout: 4000 });
  await vis("gr-sheet-close").click();
  await p.getByTestId("gr-sheet").waitFor({ state: "detached", timeout: 4000 });

  // С5 — the phone mask and its error
  const phone = vis("gr-phone");
  await phone.fill("6265550142");
  h.expect((await phone.inputValue()) === "(626) 555-0142", `С5: masked (${await phone.inputValue()})`);
  await phone.fill("626");
  await vis("gr-panel").click({ position: { x: 4, y: 4 } });
  await vis("gr-phone-err").waitFor({ timeout: 4000 });
  h.expect((await vis("gr-phone-err").locator("svg").count()) > 0, "С5: the error has its icon");

  // С6 — delete a row → «Вернуть»
  const rows = () => p.locator('[data-testid^="gr-row-"]').locator("visible=true").count();
  h.expect((await rows()) === 3, "С6: three rows");
  await vis("gr-delete").click();
  await vis("gr-toast").waitFor({ timeout: 4000 });
  h.expect((await rows()) === 2, "С6: a row is gone");
  await h.shot("toast");
  // v2 §3 п.15: the toast never covers the main button; the main button keeps 8 above the nav (design-reviewer, #2254)
  const box = async (id) => vis(id).boundingBox();
  const [toastB, mainB, navB] = [await box("gr-toast"), await box("gr-primary"), await box("gr-nav")];
  h.expect(toastB.y + toastB.height <= mainB.y - 7.5, `С6: the toast stands above the main button (${toastB.y + toastB.height} / ${mainB.y})`);
  h.expect(mainB.y + mainB.height <= navB.y - 7.5, `С6: the main button keeps 8 above the nav (${mainB.y + mainB.height} / ${navB.y})`);
  await vis("gr-toast-undo").click();
  await until("С6 row back", () => document.querySelectorAll('[data-testid^="gr-row-"]').length === 3);
  await p.getByTestId("gr-toast").waitFor({ state: "detached", timeout: 4000 });

  // the task row: the check on the left marks it (seen 24, hit 44)
  await vis("gr-task-check").click();
  await until("task checked", () => document.querySelector('[data-testid="gr-task-check"]')?.getAttribute("aria-pressed") === "true");
  const hit = await vis("gr-task-check").boundingBox();
  h.expect(hit.width >= 34 && hit.height >= 34, `task check: the hit area holds the 34 square (+ hitSlop to 44) (${hit.width}×${hit.height})`);

  // С7 — the pilot's theme switch; yellow only on the main button and «＋»
  const sceneBg = () => vis("gr-screen").evaluate((el) => getComputedStyle(el).backgroundColor);
  const before = await sceneBg();
  await vis("gr-theme").click(); // system → dark
  await vis("gr-theme").click(); // dark → light
  const light = await sceneBg();
  await vis("gr-theme").click(); // light → system
  h.expect(light === "rgb(236, 237, 238)", `С7: light scene (${light})`);
  h.expect((await sceneBg()) === before, "С7: back to the system theme");
  const yellow = await vis("gr-screen").evaluate((root, y) => [...root.querySelectorAll("*")].filter((n) => getComputedStyle(n).backgroundColor === y && !n.closest('[data-testid="gr-nav-beam"]')).map((n) => n.closest("[data-testid]")?.getAttribute("data-testid") ?? "?"), YELLOW);
  // the beam is a glow, not a fill (handoff v2 §3 п.3): it is left out
  h.expect(yellow.length === 2, `С7: yellow fill only on the main button and «＋» (${yellow.join(", ")})`);
  await h.shot("pilot");

  await vis("gr-close").click();
  await p.getByTestId("gr-screen").waitFor({ state: "detached", timeout: 4000 });
};
