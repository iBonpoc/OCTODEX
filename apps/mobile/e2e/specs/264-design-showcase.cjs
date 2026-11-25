/**
 * «Дизайн-система» (#1093, #1150), every view: Настройки → «Дизайн-система».
 * - the row is in the settings (the demo's director sees it) and opens the list of sections;
 * - every section of the registry is a row; a tap opens its own screen, «Назад» returns to the list;
 * - «Основа»: the token groups of both themes are live values from packages/design-tokens (a motion token, a status colour);
 * - an unknown section goes back to the list; no horizontal overflow.
 * - #2745 (founder 25.11, #2744): the token screens are rows again, a group of their own; the theme switch is on the list
 *   and on every section; a long token value does not break the token's name letter by letter.
 */
const { expectOneAccent } = require("../accent.cjs");

const SECTIONS = ["buttons", "selectors", "windows", "notices", "haptics"];
// #2745: the token screens are rows again (they were folded into the «Графит» sheet by #2292), in the group «Токены»
const TOKENS = ["base", "spacing", "motion"];

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings");
  await vis("settings-design-system").waitFor({ timeout: 5000 });
  await vis("settings-design-system").getByText("Дизайн-система", { exact: true }).click();
  await vis("showcase-sections").waitFor({ timeout: 5000 });
  for (const id of SECTIONS) h.expect((await p.getByTestId(`showcase-row-${id}`).count()) === 1, `row ${id} is in the list`);
  for (const id of TOKENS) h.expect((await p.getByTestId("showcase-sections-tokens").getByTestId(`showcase-row-${id}`).count()) === 1, `row ${id} is in the tokens group`);
  h.expect((await p.getByTestId("showcase-sections").getByTestId("showcase-row-base").count()) === 0, "the tokens are not among the parts");

  // #2745: the theme switch of the showcase changes the app's theme (the same stored choice as in Settings)
  const other = h.layout.theme === "dark" ? "Светлая" : "Тёмная";
  await vis("showcase-theme").getByText(other, { exact: true }).click();
  const want = h.layout.theme === "dark" ? "light" : "dark";
  await p.waitForFunction((th) => JSON.parse(localStorage.getItem("octo.theme.v1") || "null") === th, want, { timeout: 5000 });
  await vis("showcase-theme").getByText(h.layout.theme === "dark" ? "Тёмная" : "Светлая", { exact: true }).click();
  await p.waitForFunction((th) => JSON.parse(localStorage.getItem("octo.theme.v1") || "null") === th, h.layout.theme, { timeout: 5000 });

  // a row opens its screen, «Назад» returns
  await vis("showcase-row-buttons").getByText("Кнопки", { exact: true }).click();
  await vis("showcase-screen-buttons").waitFor({ timeout: 5000 });
  h.expect(new URL(p.url()).pathname === "/settings/design-system/buttons", `the row opens its own address (${p.url()})`);
  await p.getByRole("button", { name: /^Назад: Дизайн-система/ }).locator("visible=true").first().click();
  await vis("showcase-sections").waitFor({ timeout: 5000 });
  h.expect(new URL(p.url()).pathname === "/settings/design-system", `«Назад» returns to the list (${p.url()})`);

  // «Основа»: live tokens of both themes
  await h.go("/settings/design-system/base");
  await vis("showcase-screen-base").waitFor({ timeout: 5000 });
  for (const id of ["tokens-color", "tokens-text", "tokens-print"]) h.expect((await p.getByTestId(`showcase-${id}`).count()) === 1, `base shows ${id}`);
  for (const g of ["themes", "font"]) h.expect((await p.getByTestId(`token-group-${g}`).count()) === 1, `token group ${g}`);
  const ok = await p.getByTestId("token-themes.status.ok.text").locator("xpath=../..").innerText();
  h.expect(/#[0-9A-Fa-f]{6}/.test(ok), `themes.status.ok.text shows a colour (${ok.replace(/\n/g, " ")})`);
  h.expect(/Только для модуля ниши/.test(await h.text()), "the niche module's own tokens carry their note");
  h.expect((await p.getByTestId("showcase-theme").count()) === 1, "a section has the theme switch too");
  // #2745 (#2741 п.3): four colours as a value used to squeeze the name into a column of letters — the name stays one line
  const name = p.getByTestId("token-themes.drawing.story").locator("visible=true").first();
  const box = await name.boundingBox();
  const line = await vis("token-themes.page").boundingBox();
  h.expect(box && line && box.height <= line.height * 1.5, `a long value leaves the name on one line (${box?.height} vs ${line?.height})`);

  await h.go("/settings/design-system/motion");
  await vis("showcase-screen-motion").waitFor({ timeout: 5000 });
  const motion = await p.getByTestId("token-motion.durFast").locator("xpath=../..").innerText();
  h.expect(/160/.test(motion), `motion.durFast shows 160 (${motion.replace(/\n/g, " ")})`);
  // Ш III-1 (#2292): the new tokens are drawn by the group, nothing is added by hand
  const durPress = await p.getByTestId("token-motion.durPress").locator("xpath=../..").innerText();
  h.expect(/80/.test(durPress), `motion.durPress shows 80 (${durPress.replace(/\n/g, " ")})`);
  h.expect((await p.getByTestId("token-motion.easeInOut").count()) === 1, "motion.easeInOut is in the showcase");

  // an unknown section returns to the list
  await h.go("/settings/design-system/nothing");
  await vis("showcase-sections").waitFor({ timeout: 5000 });
  await expectOneAccent(h, "the design showcase");
};
