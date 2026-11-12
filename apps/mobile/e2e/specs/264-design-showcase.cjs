/**
 * «Дизайн-система» (#1093, #1150), every view: Настройки → «Дизайн-система».
 * - the row is in the settings (the demo's director sees it) and opens the list of sections;
 * - every section of the registry is a row; a tap opens its own screen, «Назад» returns to the list;
 * - «Основа»: the token groups of both themes are live values from packages/design-tokens (a motion token, a status colour);
 * - an unknown section goes back to the list; no horizontal overflow.
 */
const { expectOneAccent } = require("../accent.cjs");

const SECTIONS = ["base", "buttons", "selectors", "windows", "notices", "motion", "haptics", "spacing"];

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings");
  await vis("settings-design-system").waitFor({ timeout: 5000 });
  await vis("settings-design-system").getByText("Дизайн-система", { exact: true }).click();
  await vis("showcase-sections").waitFor({ timeout: 5000 });
  for (const id of SECTIONS) h.expect((await p.getByTestId(`showcase-row-${id}`).count()) === 1, `row ${id} is in the list`);

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

  await h.go("/settings/design-system/motion");
  await vis("showcase-screen-motion").waitFor({ timeout: 5000 });
  const motion = await p.getByTestId("token-motion.durFast").locator("xpath=../..").innerText();
  h.expect(/160/.test(motion), `motion.durFast shows 160 (${motion.replace(/\n/g, " ")})`);

  // an unknown section returns to the list
  await h.go("/settings/design-system/nothing");
  await vis("showcase-sections").waitFor({ timeout: 5000 });
  await expectOneAccent(h, "the design showcase");
};
