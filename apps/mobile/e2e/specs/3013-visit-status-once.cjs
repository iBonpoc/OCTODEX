/**
 * #3013 (code-reviewer on the merge with main, 28.11): the object's status line under the name («✓ Оплачено · $342.00», #3012) is
 * the invoice's — a screen asks for it. The visit has its own status pill in the lead (`visit-status`) and a subtitle (the time and
 * the people): it does not get the status line, so its status is said once, never twice and never in two different words
 * («Назначен» over «В пути»). Every view, by testID: the visit — no `visit-screen-subtitle`, one `visit-status`; the invoice — its
 * status line is there.
 */
exports.run = async (h) => {
  const p = h.page;
  const count = (id) => p.getByTestId(id).locator("visible=true").count();

  await h.go("/visit/v1");
  await p.getByTestId("visit-status").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await count("visit-status")) === 1, "the visit's status is its one pill");
  h.expect((await count("visit-screen-subtitle")) === 0, "the visit has no status line under the name (no second status)");

  // the invoice asks for it: «✓ status · sum» under the name
  await h.go("/invoice/i1");
  await p.getByTestId("invoice-screen-subtitle").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await count("invoice-screen-subtitle")) === 1, "the invoice keeps its status line");
  await h.shot(1);
};
