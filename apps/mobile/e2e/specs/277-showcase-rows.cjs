/**
 * Showcase «Строки и списки сметы» (#1093, DS §8.3–8.5, Б13, §14.6), every view: the list-drag feel is live (three buttons
 * name themselves in «Последний отклик»), the samples that come with their components are named with their DS place.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/settings/design-system/rows");
  await vis("showcase-rows").waitFor({ timeout: 5000 });
  h.expect(/Пока ничего не нажато/.test(await vis("showcase-rows-last").innerText()), "nothing pressed yet");
  for (const [id, name] of [["light", "Подъём строки"], ["medium", "Строка встала на место"], ["selection", "Граница раздела"]]) {
    await vis(`showcase-rows-feel-${id}`).getByRole("button").first().click();
    const last = await vis("showcase-rows-last").innerText();
    h.expect(last.includes(name), `${id}: the last response is «${name}» (${last.replace(/\n/g, " ")})`);
  }
  for (const id of ["row", "swipe", "section", "required", "profit", "catalog"]) {
    await vis(`showcase-rows-${id}-soon`).waitFor({ timeout: 3000 });
    h.expect((await vis(`showcase-rows-${id}`).innerText()).length > 20, `${id}: named, with its rule`);
  }
  // the list of sections names it
  await h.go("/settings/design-system");
  await vis("showcase-row-rows").waitFor({ timeout: 5000 });
};
