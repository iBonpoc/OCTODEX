/**
 * e2e 472 (#2020) — «Показать клиенту» in the demo: the page works as the client's, as before (story map S8 «Подпись клиента»).
 * С2 ДАНО the demo (no cloud), КОГДА the office opens a sent estimate «as client» from its «⋯», ТОГДА there is no «Так увидит
 * клиент» note, the client's signing works and the estimate awaits the company. The cloud side (a preview that does not sign
 * or pay) — e2e/cloud/specs/472-cloud-portal-preview.cjs, against a real server. Six views (h.layout).
 */
const { estAct } = require("../estimateMenu.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/estimate/e6");
  await estAct(p, "client");
  await p.waitForURL(/\/p\/demo0handyman0estimate0000000001/, { timeout: 8000 });
  await p.getByTestId("portal-sign").locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("portal-preview-note").count()) === 0, `С2 ${h.layout}: the demo has no preview note`);
  await h.sign("Linda Alvarez");
  await h.expectText(/Estimate approved/, `С2 ${h.layout}: the demo signs as the client did`);
  const db = await h.db();
  h.expect(db.estimates.find((e) => e.id === "e6").status === "awaiting_countersign", `С2 ${h.layout}: awaiting the company`);
  await h.shot("demo-signed");
};
