/**
 * With «Уменьшить движение» the toast with «Отменить» appears at once, right where the finger is. A double tap on
 * «Создать работу» put the second tap on «Отменить» and took back the client and the job just made (found by #261:
 * e2e 64 under reduced motion). «Отменить» ignores taps for the first motion.toastArmMs after it shows; a deliberate
 * tap after that still undoes. Every view.
 */
exports.run = async (h) => {
  const p = h.page;
  await p.emulateMedia({ reducedMotion: "reduce" });
  await h.go("/job/new");
  await h.click("Новый клиент");
  await p.getByPlaceholder("Имя", { exact: false }).first().fill("Quinn Double");
  await p.getByPlaceholder("(555) 555-0100").last().fill("(555) 555-0121");
  await p.getByPlaceholder("Улица, дом, офис").last().fill("121 Oak Ln");
  await p.getByPlaceholder("Pasadena, CA 91103").last().fill("Pasadena, CA 91104");
  await p.getByTestId("job-new-title").locator("visible=true").locator("input").last().fill("Gate latch");
  // a double tap where the button is — the toast with «Отменить» shows up at once under the same finger
  await p.getByRole("button", { name: "Создать работу", exact: true }).last().dblclick();
  await p.waitForTimeout(700);
  let db = await h.db();
  h.expect(db.customers.some((c) => c.name === "Quinn Double"), "a double tap does not undo the new client");
  h.expect(db.jobs.some((j) => j.title === "Gate latch"), "a double tap does not undo the new job");

  // a deliberate «Отменить» a moment later still works
  const undo = p.getByRole("button", { name: "Отменить", exact: true }).last();
  if ((await undo.count()) > 0 && (await undo.isVisible())) {
    await undo.click();
    await p.waitForTimeout(500);
    db = await h.db();
    h.expect(!db.jobs.some((j) => j.title === "Gate latch"), "«Отменить» tapped on purpose takes the job back");
  } else {
    h.expect(false, "the toast with «Отменить» is still there for a deliberate tap");
  }
};
