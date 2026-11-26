/**
 * e2e 539 — #2760: a lead with no estimate, after the quick action «Ответил» (we answered on the marketplace), waits on OUR
 * MESSAGE, not on an estimate: no «Смета у клиента 0 дн без ответа» and no «Напомнить про смету» — the main step is
 * «Что дальше?» with its own words. Demo `/lead/l1` (Kevin Brooks, new, no estimates). Every view. By testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const lead = async () => ((await h.db())?.leads ?? []).find((x) => x.id === "l1");

  await h.go("/lead/l1");
  await tid("lead-next-reply").waitFor();
  h.expect(((await h.db())?.estimates ?? []).every((e) => e.leadId !== "l1"), "the demo lead has no estimate");

  await tid("lead-answered").click();
  await p.waitForFunction(([k]) => JSON.parse(localStorage.getItem(k) ?? "{}")?.db?.leads?.find((x) => x.id === "l1")?.status === "replied", [DB_KEY], { timeout: 5000 });
  h.expect((await lead())?.status === "replied", "«Ответил» → the lead is replied");

  await tid("lead-next-next").waitFor({ timeout: 5000 });
  h.expect((await p.getByTestId("lead-next-remind").locator("visible=true").count()) === 0, "no «Напомнить про смету» without an estimate");
  const reason = await tid("lead-now").innerText();
  h.expect(/ждём клиента/i.test(reason) && !/смет/i.test(reason), `the step's words are about our reply, not an estimate: ${reason}`);
  h.expect(!/Смета у клиента/.test(await p.locator("body").innerText()), "no «Смета у клиента … без ответа» on the card");
  await h.shot("replied");
};
