/**
 * #1219: a sales tax rate with three decimals (New York 8.875 %) on a job's own lines. The rate field takes it, the tax
 * line says «8.875%» and counts $88.75 on $1000 (8.88 % would be $88.80); the job keeps ppm 88750 beside its basis
 * points 888 (older phones read those). Test prices.
 */
exports.run = async (h) => {
  const p = h.page;
  const job = async () => (await h.db()).jobs.find((j) => j.id === "j3");
  const visible = (id) => p.getByTestId(id).locator("visible=true").first();

  await h.go("/job/j3");
  await p.getByRole("tab", { name: "Деньги", exact: true }).locator("visible=true").click();
  await p.getByRole("button", { name: "Позиция", exact: true }).first().click();
  const s = h.sheet();
  await s.getByPlaceholder("Название").fill("Install");
  await s.getByPlaceholder("Кол-во").fill("1");
  await s.getByPlaceholder("Цена").fill("1000");
  await s.getByRole("button", { name: "Сохранить", exact: true }).last().click();
  await s.waitFor({ state: "detached" });
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.jobs?.find((j) => j.id === "j3")?.amountCents === 100000);

  // the tax on, then the rate 8.875
  await p.getByRole("switch", { name: "Налог с продаж" }).locator("visible=true").first().click();
  await visible("job-tax-rate").waitFor();
  await visible("job-tax-rate").locator("input").fill("8.875");
  await visible("job-tax-save").getByRole("button").click();
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.jobs?.find((j) => j.id === "j3")?.taxRatePpm === 88750);
  const j = await job();
  h.expect(j.taxRateBps === 888 && j.amountCents === 108875, `the job keeps 88750 ppm / 888 bps, $1088.75 (${j.taxRateBps}, ${j.amountCents})`);
  const line = await visible("job-tax-line").innerText();
  h.expect(/8\.875\s*%/.test(line) && /\$88\.75/.test(line), `the tax line says 8.875% and $88.75 («${line}»)`);
  h.expect((await visible("job-tax-rate").locator("input").inputValue()) === "8.875", "the field keeps 8.875");
  await h.shot("ny-tax");

  // a rate the field cannot take (five decimals): refused, nothing changes
  await visible("job-tax-rate").locator("input").fill("8.87512");
  await visible("job-tax-save").getByRole("button").click();
  await h.expectText(/Ставка — число от 0 до 100/, "the refusal says the rate");
  h.expect((await job()).taxRatePpm === 88750, "the rate stays 8.875 %");
};
