/**
 * Screens by role (route-guard, src/nav/roles.ts routeRoles; docs/specs/03 §8.1, 05 §2, §4.2).
 * Audit on build 109: a technician opened /today, /money, /team, /company by a direct link and saw the company's money;
 * «/» opened «My visits» for everyone — `href: null` on (tabs)/index made the address fall to the first tab.
 */
const setRole = (h, role) =>
  h.page.evaluate((r) => (r ? localStorage.setItem("octo.role.v1", JSON.stringify(r)) : localStorage.removeItem("octo.role.v1")), role);
const at = (h) => new URL(h.page.url()).pathname;

exports.run = async (h) => {
  const p = h.page;
  await h.go("/more");

  // «/» → the role's own home screen (failed before the fix: /visits for every role)
  for (const [role, home] of [["director", "/today"], ["dispatcher", "/triage"], ["sales", "/inbox"], ["tech", "/visits"]]) {
    await setRole(h, role);
    await h.go("/");
    await p.waitForTimeout(500);
    h.expect(at(h) === home, `${role}: «/» opens ${home} (got ${at(h)})`);
  }
  // nothing chosen yet (a new phone): the first role this person has — in the demo the director
  await setRole(h, null);
  await h.go("/");
  await p.waitForTimeout(500);
  h.expect(at(h) === "/today", `no role saved: «/» opens /today (got ${at(h)})`);
  // the tab bar has no extra «index» tab
  h.expect((await p.getByRole("button", { name: /^index$/i }).count()) === 0 && (await p.getByText(/^index$/).count()) === 0, "no «index» tab");

  // the technician by a direct link: back to his own home with a toast, no company money on the way
  await setRole(h, "tech");
  for (const path of ["/money", "/team", "/company", "/company/hours", "/today", "/figures/profit", "/triage", "/inbox"]) {
    await h.go(path);
    await p.waitForTimeout(500);
    h.expect(at(h) === "/visits", `tech ${path} → /visits (got ${at(h)})`);
    if (path === "/money") await h.expectText(/Нет доступа к этому экрану/, "toast «Нет доступа»");
  }
  // his own screens still open
  for (const path of ["/visits", "/plan", "/clients", "/jobs", "/estimates", "/catalog", "/settings"]) {
    await h.go(path);
    h.expect(at(h) === path, `tech opens ${path} (got ${at(h)})`);
  }

  // Company settings and Team — director only
  await setRole(h, "dispatcher");
  for (const path of ["/team", "/company"]) {
    await h.go(path);
    await p.waitForTimeout(500);
    h.expect(at(h) === "/triage", `dispatcher ${path} → /triage (got ${at(h)})`);
  }
  await setRole(h, "director");
  for (const path of ["/team", "/company", "/money", "/today"]) {
    await h.go(path);
    h.expect(at(h) === path, `director opens ${path} (got ${at(h)})`);
  }
};
