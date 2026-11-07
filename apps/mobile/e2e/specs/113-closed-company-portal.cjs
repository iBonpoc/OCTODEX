/**
 * 7а-3 (docs/specs/22 §3.5, «Каркас» №8): the client page of a company its owner closed (S22a).
 * The server's answer is put in by the browser (page.route, no network): {status: 'closed', company: {name}, doc_language}.
 * The page says it first, in the client's language (rule 7: es here, the app is in Russian), with no phone, no estimate,
 * no signing and no payment.
 */
exports.run = async (h) => {
  const p = h.page;
  let asked = 0;
  await p.route("**/rest/v1/rpc/portal_estimate*", (route) => {
    asked += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "closed", company: { name: "Sunset Gutters" }, doc_language: "es" }),
    });
  });
  await h.go("/p/tok_e2e113_closed_0123456789");
  await h.expectText(/Sunset Gutters cerró — los documentos de este enlace ya no están disponibles/, "closed: said in the client's language");
  h.expect(asked > 0, "the page asked the server");
  const text = await h.text();
  h.expect(!/закрыта|has closed/.test(text), "not in the app's language, not in English");
  h.expect(!/Firmar|Pagar|Opciones|\$/.test(text), "no signing, no payment, no estimate");
  await h.expectText(/Cerrada/, "the status chip: a short word");
  h.expect(!/\+1|\(\d{3}\)/.test(text), "no phone of the closed company");
  await h.shot("closed");
};
