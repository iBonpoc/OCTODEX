/**
 * The «Демо» strip (#1183 п.1, DS §13), every view: in the demo every screen says that the data is made up and lives on
 * this phone only; a tap goes to sign-in, where the strip is not shown. (In the cloud it is never shown — the unit test
 * test/demoBadge.test.ts holds the rule; the strip reads the store's mode.)
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  for (const path of ["/today", "/clients", "/settings"]) {
    await h.go(path);
    await vis("demo-badge").waitFor({ timeout: 5000 });
    const text = await vis("demo-badge").innerText();
    h.expect(/Демо · данные только на этом телефоне/.test(text), `${path}: the strip says it (${text.replace(/\n/g, " ")})`);
  }
  await h.go("/today");
  await vis("demo-badge").getByRole("button").first().click();
  await p.waitForURL(/\/auth\/sign-in/, { timeout: 5000 });
  await p.getByTestId("demo-badge").waitFor({ state: "detached", timeout: 5000 });
  h.expect((await p.getByTestId("demo-badge").count()) === 0, "sign-in: no strip");
};
