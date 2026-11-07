/**
 * Пуши P2 (docs/specs/27-push.md §5), every view: «Мои настройки» → «Уведомления» on the web.
 * - the group «Уведомления» stands right before «О приложении»;
 * - the web never shows a switch that does nothing: no «Пуш-уведомления на этом телефоне», no «Открыть настройки
 *   телефона»; one quiet line says where pushes come (the app on the phone) and that the bell is here;
 * - the line is quiet (not a status colour), no new accent on the screen.
 * The phone paths (permission, token, tap → screen) are unit tests (test/push.test.ts) and the db T80–T81.
 */
const { expectOneAccent } = require("../accent.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/settings");
  await p.getByText("Уведомления", { exact: true }).locator("visible=true").first().waitFor({ timeout: 5000 });
  const text = await h.text();
  const iPush = text.indexOf("Уведомления");
  const iAbout = text.indexOf("О приложении");
  h.expect(iPush >= 0 && iAbout > iPush, `«Уведомления» right before «О приложении» (${iPush}, ${iAbout})`);
  const between = text.slice(iPush, iAbout);
  h.expect(/Пуши приходят в приложении OCTODEX на телефоне/.test(between), "the web says where pushes come");
  h.expect(/колокольчик/.test(between), "…and that the bell works here");
  h.expect(!/Пуш-уведомления на этом телефоне/.test(text), "no switch on the web");
  h.expect((await p.getByRole("button", { name: "Открыть настройки телефона", exact: true }).count()) === 0, "no phone-settings button on the web");
  h.expect(!/Expo Go/.test(between), "the web is not told about Expo Go");
  await expectOneAccent(h, "settings with the notifications group");
};
