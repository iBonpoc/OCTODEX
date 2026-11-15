/**
 * Showcase «Вибрация» (#1093 В1, DS §15.6), every view: the map has six responses, each button names itself in
 * «Последний отклик»; the web says it has no haptics (and shows no switch).
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system/haptics");
  await vis("showcase-haptics").waitFor({ timeout: 5000 });
  h.expect(/Пока ничего не нажато/.test(await vis("showcase-hap-last").innerText()), "nothing pressed yet");
  h.expect((await p.getByTestId("showcase-hap-switch").count()) === 0, "no switch on the web");
  const names = { selection: "Выбор", light: "Лёгкий", medium: "Средний", success: "Успех", warning: "Предупреждение", error: "Ошибка" };
  for (const [kind, name] of Object.entries(names)) {
    await vis(`showcase-hap-${kind}`).getByRole("button").first().click();
    const last = await vis("showcase-hap-last").innerText();
    h.expect(last.includes(name), `${kind} is the last response (${last})`);
  }
};
