/**
 * «Вибрация» (DS §15.6, В-20, #1009), every view: «Настройки» → the switch lives on the phone only.
 * The web has no vibration, so (as in 124-push-settings) it never shows a switch that does nothing: no «Вибрация»
 * row, no switch of that name. The phone behaviour (on by default, off = not a single call, the device key stays
 * after the account is deleted) is the unit test test/haptics.test.ts.
 */
const { expectOneAccent } = require("../accent.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/settings");
  await p.getByTestId("settings-about").locator("visible=true").first().waitFor({ timeout: 5000 });
  const text = await h.text();
  h.expect(!/Вибрация/.test(text), "no «Вибрация» row on the web");
  h.expect((await p.getByRole("switch", { name: "Вибрация", exact: true }).count()) === 0, "no vibration switch on the web");
  await expectOneAccent(h, "settings without the vibration row");
};
