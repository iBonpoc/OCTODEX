/**
 * 3b-2 (docs/specs/17-job.md §11.1): the CA written-contract warning (a CA company, a home, no estimate, the lines over
 * $500.00 — engine caWrittenContractRequired; a commercial property — none); «Тип работы» and «Метки» on «Детали».
 * Test prices.
 */
exports.run = async (h) => {
  const p = h.page;
  const tab = async (name) => {
    await p.getByRole("tab", { name, exact: true }).locator("visible=true").click(); await p.waitForTimeout(300);
  };
  const line = async (qty, price) => {
    await p.getByRole("button", { name: "Позиция", exact: true }).first().click(); await p.waitForTimeout(400);
    await h.sheet().getByPlaceholder("Название").fill("Repair");
    await h.sheet().getByPlaceholder("Кол-во").fill(qty);
    await h.sheet().getByPlaceholder("Цена").fill(price);
    await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  };

  await h.go("/job/j3");
  await tab("Деньги");
  await line("5", "100");
  h.expect((await p.getByText("Нужен договор", { exact: true }).count()) === 0, "exactly $500.00 — no warning");
  await p.getByText("Repair", { exact: true }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByPlaceholder("Цена").fill("100.01");
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  await h.expectText(/Нужен договор/, "over $500 on a home in CA — the warning");
  await h.expectText(/нужен письменный договор/, "it says what is needed");
  h.expect((await p.getByRole("button", { name: /Сделать смету/ }).count()) === 0, "no «Сделать смету» button (it would make a second job)");
  await h.shot("ca");

  // a commercial property: no warning
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.properties = s.db.properties.map((x) => (x.id === "p3" ? { ...x, kind: "commercial" } : x));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/job/j3");
  await tab("Деньги");
  await h.expectText(/\$500\.05/, "the lines are there");
  h.expect((await p.getByText("Нужен договор", { exact: true }).count()) === 0, "a commercial property — no warning");

  // «Тип работы»: Ремонт → Гарантия
  await tab("Детали");
  await p.getByText("Тип работы", { exact: true }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByText("Гарантия", { exact: true }).click(); await p.waitForTimeout(500);
  h.expect((await h.db()).jobs.find((j) => j.id === "j3").jobTypeId === "jt-warranty", "the job type changed");
  await h.expectText(/Гарантия/, "the details show the new type");

  // «Метки»
  await p.getByText("Метки", { exact: true }).first().click(); await p.waitForTimeout(400);
  await h.sheet().getByText("VIP", { exact: true }).click(); await p.waitForTimeout(200);
  await h.sheet().getByRole("button", { name: "Сохранить", exact: true }).last().click(); await p.waitForTimeout(500);
  h.expect(((await h.db()).jobs.find((j) => j.id === "j3").tagIds || []).includes("tag-vip"), "the tag is on the job");
  await h.shot("type-tags");

  // the technician: reads, does not change
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/job/j1");
  await p.getByText("Тип работы", { exact: true }).first().click(); await p.waitForTimeout(300);
  h.expect((await p.getByText("Гарантия", { exact: true }).count()) === 0, "the technician does not get the type sheet");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
