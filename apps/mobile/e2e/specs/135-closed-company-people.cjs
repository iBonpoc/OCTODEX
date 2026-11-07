/**
 * 7а-3 «в» (S22b; docs/specs/22 §3.6): a person whose company its owner closed. Before, nothing told them: no company →
 * the app silently opened the demo. Now: a sheet once per company at the start, the card on «Создать компанию» and in
 * «Профиль и аккаунт», and the changes still waiting for that company with «Убрать…» (asked first, rule 5).
 * The server is put in by the browser (page.route, no network): a signed-in session, no memberships, my_closed_companies
 * returns the company. The real server's side is T77.
 */
const UID = "a1350000-0000-4000-8000-000000000001";
const CO = "c1350000-0000-4000-8000-000000000001";
const OTHER = "c1350000-0000-4000-8000-000000000002";
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 820;
  let asked = 0;
  const json = (route, body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await p.route("**/*.supabase.co/**", (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith("/auth/v1/user")) return json(route, { id: UID, email: "wes@e2e.test", aud: "authenticated", role: "authenticated" });
    if (u.pathname.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, body: "" });
    if (u.pathname === "/rest/v1/rpc/legal_status") return json(route, { ok: true });
    if (u.pathname === "/rest/v1/rpc/my_closed_companies") {
      asked += 1;
      return json(route, [{ company_id: CO, name: "Sunset Gutters", closed_at: "2026-11-05T18:00:00Z" }]);
    }
    if (u.pathname === "/rest/v1/users") return json(route, { deleted_at: null });
    // memberships and anything else: nothing
    return json(route, []);
  });
  // signed in (a session the app keeps itself) and two changes left for the closed company, one for another
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp, role: "authenticated" })}.sig`;
  await p.context().addInitScript(
    ({ jwt, exp, UID, CO, OTHER }) => {
      if (sessionStorage.getItem("e2e135")) return;
      sessionStorage.setItem("e2e135", "1");
      localStorage.setItem(
        "sb-kgiaxygsjkyiquhjbxdg-auth-token",
        JSON.stringify({ access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "r135", user: { id: UID, email: "wes@e2e.test", aud: "authenticated" } }),
      );
      const op = (id, companyId) => ({ id, op: { k: "lead.add" }, at: "2026-11-05T17:00:00Z", tries: 0, owner: { userId: UID, companyId } });
      localStorage.setItem("octo.outbox.v1", JSON.stringify([op("o1", CO), op("o2", CO), op("o3", OTHER)]));
      localStorage.removeItem("octo.closedSeen.v1");
    },
    { jwt, exp, UID, CO, OTHER },
  );
  await h.go("/more");
  // the sheet at the start, once
  const notice = p.getByTestId("closed-notice").locator("visible=true");
  await notice.first().waitFor({ timeout: 8000 });
  h.expect(asked > 0, "the app asked the server which company was closed");
  await h.expectText(/Компания «Sunset Gutters» закрыта владельцем/, "the sheet names the company");
  await h.expectText(/закрыл компанию Nov 5, 2026\./, "and when it was closed, in the US format (rule 7)");
  await h.shot("notice");
  await notice.getByRole("button", { name: "Понятно", exact: true }).first().click();
  await p.waitForTimeout(500);
  h.expect((await p.getByTestId("closed-notice").locator("visible=true").count()) === 0, "«Понятно» closes it");
  h.expect((await p.evaluate(() => localStorage.getItem("octo.closedSeen.v1"))) === JSON.stringify([CO]), "remembered: shown for this company");
  await h.go("/more");
  await p.waitForTimeout(800);
  h.expect((await p.getByTestId("closed-notice").locator("visible=true").count()) === 0, "not again after a restart");
  // «Создать компанию»: the card above the form, no sheet
  await h.go("/auth/company");
  await p.getByTestId(`closed-${CO}`).locator("visible=true").first().waitFor({ timeout: 8000 });
  await h.expectText(/Закрыта/, "the status chip: icon and a word (rule 2)");
  await h.shot("company");
  // «Профиль и аккаунт»: the card and what still waits for that company (only mine for it: 2, not the other company's)
  await h.go("/settings/profile");
  const card = p.getByTestId(`closed-${CO}`).locator("visible=true").first();
  await card.waitFor({ timeout: 8000 });
  await h.expectText(/2 изм\. не отправлено: компания закрыта/, "the unsent changes of that company");
  await p.getByTestId(`closed-drop-${CO}`).locator("visible=true").first().getByRole("button").click();
  await h.expectText(/Убрать 2 изм\. с телефона\? Вернуть их будет нельзя\./, "asked first (rule 5)");
  // «Оставить» keeps them
  await p.getByRole("button", { name: "Оставить", exact: true }).locator("visible=true").first().click();
  await p.waitForTimeout(300);
  h.expect((await p.evaluate(() => JSON.parse(localStorage.getItem("octo.outbox.v1") || "[]").length)) === 3, "«Оставить»: nothing removed");
  await p.getByTestId(`closed-drop-${CO}`).locator("visible=true").first().getByRole("button").click();
  await p.getByTestId(`closed-drop-yes-${CO}`).locator("visible=true").first().getByRole("button", { name: "Да, убрать", exact: true }).click();
  await h.expectText(/Изменения убраны/, "a toast");
  await p.waitForTimeout(600);
  const left = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.outbox.v1") || "[]").map((o) => o.id));
  h.expect(JSON.stringify(left) === JSON.stringify(["o3"]), `only that company's changes are gone (${JSON.stringify(left)})`);
  h.expect((await p.getByTestId(`closed-unsent-${CO}`).locator("visible=true").count()) === 0, "the line is gone with them");
  await h.shot("profile");
  if (wide) h.expect((await p.getByTestId("tab-bar").locator("visible=true").count()) === 0, "no bottom bar at " + h.layout.width);
};
