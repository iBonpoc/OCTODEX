/**
 * «Команда» → «Пригласить»: the roles are Мастер · Продажи · Диспетчер · Директор (sales since #111;
 * failed before: «Продажи» could not be given to a new person). The invited person's card shows the role as a tag.
 */
const setRole = (h, r) => h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await setRole(h, "director");
  await h.go("/team");

  await p.getByRole("button", { name: "Пригласить", exact: true }).locator("visible=true").first().click();
  const sheet = p.locator('[aria-modal="true"]').filter({ hasText: "Отправить приглашение" }).last();
  await sheet.waitFor({ timeout: 3000 });
  const chip = (name) => sheet.getByRole("checkbox", { name, exact: true });
  for (const r of ["Мастер", "Продажи", "Диспетчер", "Директор"]) h.expect((await chip(r).count()) === 1, `role «${r}» in the invite`);

  await sheet.getByPlaceholder("Имя").fill("Sam Seller");
  await sheet.getByPlaceholder("Email").fill("sam@example.com");
  await chip("Мастер").click();
  await chip("Продажи").click();
  await h.shot("invite-sales");
  await sheet.getByRole("button", { name: "Отправить приглашение" }).click();
  await p.waitForTimeout(700);

  const db = await h.db();
  const m = db.members.find((x) => x.name === "Sam Seller");
  h.expect(!!m && JSON.stringify(m.roles) === JSON.stringify(["sales"]), `the invited person has the sales role (${JSON.stringify(m?.roles)})`);
  await h.expectText(/Sam Seller/, "the invited card");
  h.expect(!(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `no horizontal scroll at ${h.layout.width}`);
};
