/**
 * e2e 2991 — «Когда нужно клиенту» is ONE row-menu, not a canvas of six chips (founder 27.11: «полотна из чипов мне не нравится»,
 * #2978/#2991; DS «нет полотна чипов» #2998). Lead l3 → «Что нужно» sheet: the field «Когда нужно» shows its value in one row
 * («В этом месяце ⌄»), no radio chips; the menu → «Срочно» → the row says it → «Сохранить» → the lead keeps `asap` and its request
 * row says «Срочно»; «К дате» opens the date field under the row. Every view. By testID (rule 19): `lead-request-row`,
 * `lead-when`, `lead-when-field-button`, `lead-when-field-<key>`.
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/lead/l3");
  await tid("lead-request-row").click();
  await tid("lead-when-field-button").waitFor({ timeout: 8000 });
  h.expect((await tid("lead-when").getByRole("radio").count()) === 0, "no chips under «Когда нужно»");
  const box = await tid("lead-when-field-button").boundingBox();
  h.expect(box && box.height <= 64, `«Когда нужно» is one row (${box && box.height})`);
  // the menu: six values, a pick changes the row
  await tid("lead-when-field-button").click();
  await tid("lead-when-field-asap").click();
  await p.waitForFunction(() => /Срочно/.test([...document.querySelectorAll('[data-testid="lead-when-field-button"]')].find((e) => e.offsetParent !== null)?.textContent || ""), null, { timeout: 4000 });
  h.expect(true, "the row says «Срочно»");
  await h.shot("when-asap");
  // «К дате» — the date field under the row
  await tid("lead-when-field-button").click();
  await tid("lead-when-field-date").click();
  await p.getByPlaceholder("MM/DD/YYYY").locator("visible=true").first().waitFor({ timeout: 4000 });
  h.expect(true, "«К дате» opens the date field");
  // back to «Срочно» and save
  await tid("lead-when-field-button").click();
  await tid("lead-when-field-asap").click();
  await p.getByRole("button", { name: "Сохранить" }).locator("visible=true").last().click();
  await p.waitForFunction(() => JSON.parse(localStorage.getItem("octo.db.v5") || "{}").db?.leads?.find((l) => l.id === "l3")?.timeframe === "asap", null, { timeout: 5000 });
  h.expect(true, "the lead keeps «Срочно» (asap)");
  await p.waitForFunction(() => /Срочно/.test([...document.querySelectorAll('[data-testid="lead-request-row"]')].find((e) => e.offsetParent !== null)?.textContent || ""), null, { timeout: 5000 });
  h.expect(true, "the request row says «Срочно»");
};
