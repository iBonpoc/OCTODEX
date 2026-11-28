/**
 * e2e 2919 — the system's «Повышение контраста» reaches the screen (GoRix этап 3 «Основа», #2919; #2935 п.2), every view, by testID.
 * The web side of the switch is `prefers-contrast: more` (ThemeProvider → useSystemHighContrast → themeColors / accEdgeFrame).
 * The switch is flipped live, with no reload, as on iOS (`darkerSystemColorsChanged`):
 *   off  — the look as it is: the yellow button has no frame (#2363 F36), a grey caption is the theme's `mut`;
 *   on   — the light theme's yellow button gets its `accEdge` frame (`component.selectedBorder`), the dark one stays frameless
 *          (`accEdge` is transparent there); a grey caption takes `highContrast[theme].mut`;
 *   off again — back to the look as it is.
 * Values (packages/design-tokens): mut dark #B3B6BE / light #42454B; highContrast.mut dark #BDC0C7 / light #33353A;
 * acc #E2C15E; light accEdge #7A6418; component.selectedBorder 2.
 */
const MUT = { dark: "rgb(179, 182, 190)", light: "rgb(66, 69, 75)" };
const MUT_HC = { dark: "rgb(189, 192, 199)", light: "rgb(51, 53, 58)" };
const EDGE = "rgb(122, 100, 24)";
const ACC = "rgb(226, 193, 94)"; // acc #E2C15E, both themes
const EDGE_W = 2;
exports.run = async (h) => {
  const p = h.page;
  const theme = h.layout.theme;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await p.emulateMedia({ contrast: "no-preference" });
  await h.go("/settings/design-system/buttons");
  await tid("showcase-btn-primary").waitFor({ timeout: 8000 });
  // the primary sample: its button is the element filled with `acc`, its caption the last leaf with words
  const read = () =>
    tid("showcase-btn-primary").evaluate((e, ACC_RGB) => {
      // the yellow plate of the button (the frame lives on it, not on the pressable around it)
      const btn = [...e.querySelectorAll("*")].find((el) => getComputedStyle(el).backgroundColor === ACC_RGB);
      const leaves = [...e.querySelectorAll("*")].filter((el) => el.childElementCount === 0 && (el.textContent || "").trim().length > 1);
      const cap = leaves[leaves.length - 1];
      const s = btn ? getComputedStyle(btn) : null;
      return { bw: s ? parseFloat(s.borderTopWidth) : -1, bc: s ? s.borderTopColor : "", mut: cap ? getComputedStyle(cap).color : "" };
    }, ACC);
  const until = async (ok, what) => {
    let r = await read();
    for (let i = 0; i < 40 && !ok(r); i++) {
      await p.waitForFunction(() => new Promise((res) => requestAnimationFrame(() => res(true))));
      r = await read();
    }
    h.expect(ok(r), `${what} (${JSON.stringify(r)})`);
    return r;
  };

  await until((r) => r.bw === 0 && r.mut === MUT[theme], "off: the yellow button has no frame, the caption is the theme's mut");
  await h.shot("off");

  await p.emulateMedia({ contrast: "more" });
  if (theme === "light") await until((r) => r.bw === EDGE_W && r.bc === EDGE && r.mut === MUT_HC.light, "on, light: the yellow button gets its accEdge frame, the caption takes highContrast.mut");
  else await until((r) => r.bw === 0 && r.mut === MUT_HC.dark, "on, dark: no frame (accEdge is transparent), the caption takes highContrast.mut");
  await h.shot("on");

  await p.emulateMedia({ contrast: "no-preference" });
  await until((r) => r.bw === 0 && r.mut === MUT[theme], "off again: the look as it was");
};
