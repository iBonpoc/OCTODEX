/**
 * The client page /p/ when something is wrong (review «Лиды и клиенты» №13, «Деньги и отчёты» №4), rule 7:
 * 1) a revoked link: «no longer valid» in the CLIENT's language (es here; the app is in Russian);
 * 2) no network (fetch fails): our words in the browser's language (en-US here) — never «TypeError: Failed to fetch».
 * No network at all: the browser answers for the server (page.route / a failing fetch for portal_estimate only).
 */
exports.run = async (h) => {
  const p = h.page;
  await p.route("**/rest/v1/rpc/portal_estimate*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "revoked", company: { name: "Sunset Gutters" }, doc_language: "es" }) }));
  await h.go("/p/tok_e2e184_revoked_0123456789");
  await h.expectText(/Este enlace ya no es válido/, "revoked: in the client's language");
  let text = await h.text();
  h.expect(!/больше не действует|no longer valid/.test(text), "not in the app's language, not in English");

  // no network: fetch of portal_estimate fails the way a browser offline does (no console error of a blocked request)
  await p.addInitScript(() => {
    const real = window.fetch.bind(window);
    window.fetch = (u, o) => (String(u && u.url ? u.url : u).includes("/rpc/portal_estimate") ? Promise.reject(new TypeError("Failed to fetch")) : real(u, o));
  });
  await h.go("/p/tok_e2e184_offline_0123456789");
  await h.expectText(/No connection\. Check the internet and reload the page/, "offline: our words, the browser's language");
  text = await h.text();
  h.expect(!/TypeError|Failed to fetch|Не получилось/.test(text), "no raw error, not the app's language");
  await h.shot("offline");
};
