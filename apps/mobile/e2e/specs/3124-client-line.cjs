const { objMore } = require("../objectScreen.cjs");
const { settle } = require("../settle.cjs");
/**
 * #3124 В1 (spec 71 §16): the second look of the client card and the job — «Линия работы», switched in «⋯ → Вид», by testID:
 * - «Обычный» is the default: the client's sections strip is there, no line;
 * - «⋯ → Вид: линия работы»: no strip, «Идут» with the job j1 as a row (its current step «шаг N из M»), the look stays after a reload;
 * - the row opens the job in the same look: the money line, the steps (the estimate passed), no sections strip; «‹» back to the client;
 * - «⋯ → Вид: обычный» on the client: the strip again, the line gone — the plain card unchanged.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const count = (id) => p.getByTestId(id).locator("visible=true").count();

  await h.go("/client/c1");
  await vis("client-header-status").waitFor({ timeout: 8000 });
  h.expect((await count("client-screen-sections")) === 1, "«Обычный» by default: the sections strip");
  h.expect((await count("client-line")) === 0, "«Обычный» by default: no line");
  await settle(p);
  await h.shot(0);

  // «⋯ → Вид: линия работы»
  await objMore(p, "client-screen", "client-look-line");
  await vis("client-line").waitFor({ timeout: 5000 });
  h.expect((await count("client-screen-sections")) === 0, "the line look: no sections strip");
  const row = vis("client-line-job-j1");
  await row.waitFor({ timeout: 5000 });
  h.expect(/Bathroom remodel/.test(await row.innerText()), `«Идут» has the job j1: ${await row.innerText()}`);
  h.expect(/шаг \d+ из \d+|Все шаги закрыты/.test(await row.innerText()), `the row says its step: ${await row.innerText()}`);
  h.expect((await count("client-line-going")) === 1, "the group «Идут»");
  await settle(p);
  await h.shot(1);

  // the device remembers the look
  h.expect(await p.evaluate(() => localStorage.getItem("octo.client.look.v1")) === "line", "the look is stored on the device");
  await h.go("/client/c1");
  await vis("client-line").waitFor({ timeout: 8000 });
  h.expect((await count("client-screen-sections")) === 0, "after a reload: still the line");

  // the row opens the job in the same look
  await vis("client-line-job-j1").click();
  await p.waitForURL(/\/job\/j1/);
  await vis("job-line").waitFor({ timeout: 8000 });
  h.expect((await count("job-screen-sections")) === 0, "the job in the line look: no sections strip");
  h.expect((await count("job-line-steps")) === 1, "the job's steps");
  h.expect((await count("line-step-estimate-e5")) === 1, "the signed estimate is a step");
  h.expect(/Оплачено \$[\d,.]+ из \$3,420\.00/.test(await vis("job-line-money").innerText()), `the money in one line: ${await vis("job-line-money").innerText()}`);
  await settle(p);
  await h.shot(2);

  // «‹» back to the client (a phone: `hdr-back`; from 820 the trail's crumb of the client), still the line
  await p.locator('[data-testid="hdr-back"], [data-testid="crumb-/client/c1"]').locator("visible=true").first().click();
  await p.waitForURL(/\/client\/c1/);
  await vis("client-line").waitFor({ timeout: 8000 });

  // «⋯ → Вид: обычный»: the plain card again
  await objMore(p, "client-screen", "client-look-plain");
  await vis("client-screen-sections").waitFor({ timeout: 5000 });
  h.expect((await count("client-line")) === 0, "«Обычный» again: no line");
  h.expect(await p.evaluate(() => localStorage.getItem("octo.client.look.v1")) === "plain", "«Обычный» stored");
};
