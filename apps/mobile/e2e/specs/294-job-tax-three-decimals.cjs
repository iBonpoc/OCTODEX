/**
 * #1219: a sales tax rate with three decimals (New York 8.875 %) on a job's own lines. The rate field takes it, the tax
 * line says «8.875%» and counts $88.75 on $1000 (8.88 % would be $88.80); the job keeps ppm 88750 beside its basis
 * points 888 (older phones read those). «Отменить» puts the rate back. Test prices.
 */
exports.run = async (h) => {
  const p = h.page;
  const job = async () => (await h.db()).jobs.find((j) => j.id === "j3");
  const visible = (id) => p.getByTestId(id).locator("visible=true").first();
  const jobIs = (cond) => p.waitForFunction(cond, null, { timeout: 5000 });

  // a job of its own lines: one $1000 taxable line, no tax yet
  await h.go("/job/j3");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  h.expect(raw?.db?.jobs?.some((j) => j.id === "j3"), "demo has job j3");
  raw.db.jobLines = [...(raw.db.jobLines ?? []).filter((l) => l.jobId !== "j3"), { id: "e2e-294-1", jobId: "j3", position: 0, name: "Install", quantity: "1", unitPriceCents: 100000, taxable: true, totalCents: 100000 }];
  raw.db.jobs = raw.db.jobs.map((j) => (j.id === "j3" ? { ...j, amountCents: 100000, taxEnabled: false, taxRateBps: 888, taxRatePpm: undefined, estimateId: undefined } : j));
  raw.db.invoices = raw.db.invoices.filter((i) => i.jobId !== "j3");
  await h.seed("octo.db.v5", raw);
  await h.go("/job/j3");
  await visible("job-tab-money").click();

  // the tax on (the job's 8.88 %), then the rate 8.875
  await visible("job-tax-toggle").getByRole("switch").click();
  await jobIs(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.jobs?.find((j) => j.id === "j3")?.amountCents === 108880);
  await visible("job-tax-rate").locator("input").fill("8.875");
  await visible("job-tax-save").getByRole("button").click();
  await jobIs(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.jobs?.find((j) => j.id === "j3")?.taxRatePpm === 88750);
  const j = await job();
  h.expect(j.taxRateBps === 888 && j.amountCents === 108875, `the job keeps 88750 ppm / 888 bps, $1088.75 (${j.taxRateBps}, ${j.amountCents})`);
  const line = await visible("job-tax-line").innerText();
  h.expect(/8\.875\s*%/.test(line) && /\$88\.75/.test(line), `the tax line says 8.875% and $88.75 («${line}»)`);
  h.expect((await visible("job-tax-rate").locator("input").inputValue()) === "8.875", "the field keeps 8.875");
  await h.shot("ny-tax");

  // «Отменить»: back to 8.88 % — the same basis points 888, the rate 8.88 again (not 8.875)
  await p.getByRole("button", { name: /Отменить/ }).first().click();
  await jobIs(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.jobs?.find((j) => j.id === "j3")?.amountCents === 108880);
  h.expect((await job()).taxRatePpm !== 88750 && (await job()).taxRateBps === 888, "«Отменить»: 8.88 % again");

  // a rate the field cannot take (five decimals): refused, nothing changes
  await visible("job-tax-rate").locator("input").fill("8.87512");
  await visible("job-tax-save").getByRole("button").click();
  await h.expectText(/не больше 4 знаков после точки/, "the refusal says at most 4 decimals");
  h.expect((await job()).amountCents === 108880, "the job stays at 8.88 %");
};
