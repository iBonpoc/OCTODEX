/**
 * «Дизайн-система» (#1093), every view: Настройки → «Дизайн-система».
 * - the row is in the settings (the demo's director sees it) and opens the showcase;
 * - every token section of the registry is on the screen, each group with its rows;
 * - the values are the live ones of packages/design-tokens (a motion token, a status colour name), not a copy;
 * - the niche module's own tokens carry their note (rule 2); no horizontal overflow.
 */
const { expectOneAccent } = require("../accent.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/settings");
  await p.getByTestId("settings-design-system").locator("visible=true").first().waitFor({ timeout: 5000 });
  await p.getByTestId("settings-design-system").locator("visible=true").first().getByText("Дизайн-система", { exact: true }).click();
  await p.getByTestId("showcase-intro").locator("visible=true").first().waitFor({ timeout: 5000 });
  for (const id of ["tokens-color", "tokens-text", "tokens-layout", "tokens-motion", "tokens-print"]) {
    h.expect((await p.getByTestId(`showcase-${id}`).count()) === 1, `section ${id} is on the screen`);
  }
  for (const g of ["themes", "font", "space", "radius", "motion", "component"]) {
    h.expect((await p.getByTestId(`token-group-${g}`).count()) === 1, `token group ${g}`);
  }
  // live values: durFast and a status colour of the active theme
  const motion = await p.getByTestId("token-motion.durFast").locator("xpath=../..").innerText();
  h.expect(/160/.test(motion), `motion.durFast shows 160 (${motion.replace(/\n/g, " ")})`);
  const ok = await p.getByTestId("token-themes.status.ok.text").locator("xpath=../..").innerText();
  h.expect(/#[0-9A-Fa-f]{6}/.test(ok), `themes.status.ok.text shows a colour (${ok.replace(/\n/g, " ")})`);
  h.expect(/Только для модуля ниши/.test(await h.text()), "the module-only note is there");
  await expectOneAccent(h, "the design showcase");
};
