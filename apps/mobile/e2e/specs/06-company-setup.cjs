/** Company wizard step, licenses, people; the client page header shows them. */
exports.run = async (h) => {
  await h.go("/company/insurance?wizard=1");
  await h.page.getByPlaceholder("Страховая компания").first().fill("State Farm");
  await h.page.getByPlaceholder("Номер полиса").first().fill("CGL-1");
  await h.page.getByRole("switch", { name: "Нет сотрудников — освобождён" }).click();
  await h.click("Сохранить и дальше");
  h.expect(h.page.url().includes("/company/brand"), "wizard goes to the next step");
  await h.go("/company/licenses");
  await h.click("Добавить лицензию");
  await h.page.getByRole("radio", { name: "Городская бизнес-лицензия" }).click();
  await h.page.getByPlaceholder("Номер лицензии").fill("BL-1");
  await h.click("Сохранить");
  await h.go("/p/demo0handyman0estimate0000000001");
  await h.expectText(/CSLB Lic\. #TEST-000000 \(B\)/, "CSLB on the client page");
  await h.expectText(/City Lic\. #BL-1/, "city license on the client page");
};
