/**
 * e2e 427 — «Подробно» в просмотре замера говорит словами, без нулей и кодов (#814, аудит Q-04). Every view.
 * - a gutter and a corrugated downspout: its elbows by style, as the engine counts them — by default «A ×3» (#1747: they were hidden,
 *   while the canvas said «AAA» and the estimate counted three); no «колен 0 · офсетов 0» (#814);
 *   its size reads «2×3» (DS §4.5, #1916), not «2x3» nor «2″ × 3″»;
 * - the parts are words: no row is a code (`snake_case`, `coil.…`, `dsstick.…`), none is «0».
 * Finds things by testID; waits on what it checks.
 */
const { pickDsKind, skipLength, closeDsMenu, openView, pressWhenStill, canvasAt } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Без срока/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4, x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.6;
  await canvasAt(p, x0, y);
  await p.mouse.move(x0, y);
  await p.mouse.down();
  for (let i = 1; i <= 10; i++) await p.mouse.move(x0 + ((x1 - x0) * i) / 10, y);
  await p.mouse.up();
  await skipLength(p);
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click((x0 + x1) / 2, y);
  // a corrugated one: its elbows by default are 3 × A (a plain one has none, #1776)
  await pickDsKind(p, "rectRibbed");
  await p.waitForFunction(() => ((JSON.parse(localStorage.getItem("octo.db.v5") || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => e.kind === "downspout" && e.attrs?.dsStyle === "corrugated"), null, { timeout: 5000 });
  await closeDsMenu(p);
  await tid("draw-done").waitFor({ timeout: 8000 });

  await openView(p);
  await tid("view-svg").waitFor({ timeout: 5000 });
  await pressWhenStill(tid("view-details").getByRole("button"));
  await tid("view-ds-1").waitFor({ timeout: 5000 });

  const ds = (await tid("view-ds-1").innerText()).replace(/\s+/g, " ");
  h.expect(!/офсетов 0|колен 0/.test(ds), `no zero row beside the downspout (${ds})`); // i18n-old: ok — it checks the old zero row is gone
  h.expect((await tid("view-ds-line-1").count()) === 1 && /A 75° × 3/.test(ds), `the default elbows are shown: «Elbows A 75° × 3» (${ds})`);
  h.expect(/\d×\d(?!″)/.test(ds) && !/\dx\d/.test(ds) && !/\d"/.test(ds) && !/\d″\s*×/.test(ds), `the size reads «2×3» (${ds})`);

  const rows = (await tid("view-parts").locator("xpath=..").innerText()).split("\n").map((s) => s.trim()).filter(Boolean);
  h.expect(rows.length > 2, `the parts are listed (${rows.length})`);
  const codes = rows.filter((r) => /\b[a-z]+_[a-z_]+\b|\bcoil\.|\bdsstick\.|\bhidden\b|\bplain\b|\bcorrugated\b|\b\d+x\d+\b/.test(r));
  h.expect(codes.length === 0, `no part is a code (${codes.join(" | ")})`);
  await h.shot("details");
};
