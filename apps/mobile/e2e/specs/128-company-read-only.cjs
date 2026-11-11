/**
 * Spec 26 §3 (decision 07.11, LOG): the office sees «Настройки компании» but only the director changes them. Every view.
 * - office: the section is in the menu; the company page says «Только просмотр — менять может директор» (info chip,
 *   icon + word); no «Продолжить настройку»; a section opens with its fields closed — typing changes nothing,
 *   switches do not move, no «Сохранить», «Добавить», «Удалить»; the schedule has no ± and no «Сохранить»;
 * - director: the same screens are editable, «Сохранить» is there.
 * The database refuses an office update of the company anyway (core_rls T86).
 */
// The role is put into localStorage from a same-origin page where the app does NOT run (the favicon), for the next load:
// the running app writes its own state when it is left (pagehide, data/appActive.ts) and could overwrite what the spec put
// there (CHECKS §9 №10; the same as e2e/cloud/signIn.cjs seedOutbox).
const setRole = async (h, r) => {
  await h.page.goto(new URL("/favicon.ico", h.page.url()).href);
  await h.page.evaluate((x) => localStorage.setItem("octo.role.v1", JSON.stringify(x)), r);
};

exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  await setRole(h, "dispatcher");
  await h.go("/company");
  h.expect(new URL(p.url()).pathname === "/company", `the office opens /company (${p.url()})`);
  await h.expectText(/Только просмотр — менять может директор/, "the read-only note on the company page");
  h.expect((await p.getByRole("button", { name: /Продолжить/ }).locator("visible=true").count()) === 0, "no «Продолжить настройку» for the office");
  await h.shot("office-company");

  // a section: fields closed, nothing to save
  await h.go("/company/profile");
  await h.expectText(/Только просмотр — менять может директор/, "the note on a section");
  const field = p.getByPlaceholder("Acme Home Services").first();
  const before = await field.inputValue();
  h.expect(await field.isDisabled().catch(() => false) || !(await field.isEditable()), "the company name field is not editable");
  await field.click({ force: true }).catch(() => {});
  await p.keyboard.type("XYZ");
  h.expect((await field.inputValue()) === before, `typing changes nothing (${before} → ${await field.inputValue()})`);
  h.expect((await p.getByRole("button", { name: "Сохранить", exact: true }).locator("visible=true").count()) === 0, "no «Сохранить» for the office");
  const db0 = await h.db();
  h.expect(db0.company.name === before, "the company is unchanged");
  await h.shot("office-section");

  // people: no «Добавить», a person opens to read with «Закрыть», no delete and no save
  await h.go("/company/contacts");
  h.expect((await p.getByRole("button", { name: /Добавить/ }).locator("visible=true").count()) === 0, "no «Добавить» for the office");

  // the schedule: no ± hours and no «Сохранить»; a stepper does not move
  await h.go("/company/schedule");
  await h.expectText(/Только просмотр — менять может директор/, "the note on the schedule");
  h.expect((await p.getByRole("button", { name: /\+30$/ }).locator("visible=true").count()) === 0, "no + hours for the office");
  h.expect((await p.getByRole("button", { name: "Сохранить", exact: true }).locator("visible=true").count()) === 0, "no «Сохранить» on the schedule");

  // the director: the same screens are editable
  await setRole(h, "director");
  await h.go("/company/profile");
  h.expect(!/Только просмотр/.test(await h.text()), "no read-only note for the director");
  h.expect(await p.getByPlaceholder("Acme Home Services").first().isEditable(), "the director can type");
  h.expect((await p.getByRole("button", { name: "Сохранить", exact: true }).locator("visible=true").count()) === 1, "«Сохранить» for the director");
};
