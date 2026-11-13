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
  // the estimate line is live (#1307 «а»): «Кратко» by default, the trash, «Подробно» adds «$12 × 86 LF», the hidden line's «расход»
  await vis("showcase-rows-line").waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId("showcase-rows-row-soon").count()) === 0 && (await p.getByTestId("showcase-rows-compact-soon").count()) === 0, "line and «Кратко / Подробно»: no stub any more");
  await vis("est-trash-ds-l1").waitFor({ timeout: 3000 });
  h.expect(/расход \$280/.test(await vis("est-sum-ds-l2").innerText()), "the hidden sample line: «расход $280»");
  await vis("showcase-rows-line").getByText("Подробно", { exact: true }).click();
  await vis("est-times-ds-l1").waitFor({ timeout: 3000 });
  // the swipe is live now (РС-7c2): on the web a hint about «⋯», not a «coming» stub; the rest still wait for their components
  h.expect((await p.getByTestId("showcase-rows-swipe-soon").count()) === 0, "swipe: no stub any more");
  h.expect(/«⋯»/.test(await vis("showcase-rows-swipe").innerText()), "swipe: the web names «⋯»");
  for (const id of ["section", "variants", "firstHint", "notes", "fromTemplate", "required", "catalog"]) {
    await vis(`showcase-rows-${id}-soon`).waitFor({ timeout: 3000 });
    h.expect((await vis(`showcase-rows-${id}`).innerText()).length > 20, `${id}: named, with its rule`);
  }
  // «Из шаблона…» (DS 1.6.0) points to its own rule
  h.expect(/§8\.13/.test(await vis("showcase-rows-fromTemplate").innerText()), "fromTemplate: names §8.13");
  // the list of sections names it
  await h.go("/settings/design-system");
  await vis("showcase-row-rows").waitFor({ timeout: 5000 });
};
