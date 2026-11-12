/**
 * e2e 293 — #1165: an estimate computed by an older engine says «Расчёт изменился — обновите» (docs/specs/33-gutters-estimate.md
 * П23.12). Every view. A lead → «Замер» → a run → «Смета» (the lines carry the engine's version); the version in the lines
 * set to an older one → the estimate has the word, «Просмотр замера» the chip; «Обновить из замера» → the same estimate, the
 * lines carry the current version, the words are gone. A signed estimate is only told, never offered «Обновить».
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, openView } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const ofM = (l, mid) => l.source && l.source.module === "gutters" && l.source.measurementId === mid;
  const versions = async (eid, mid) => ((await db()).estimates.find((x) => x.id === eid)?.doc?.options ?? []).flatMap((o) => o.lines).filter((l) => ofM(l, mid)).map((l) => l.source.engineVersion);
  /** the version in the estimate's module lines (and its status) — written through h.seed, a page without the app (CHECKS §9 №12) */
  const setVersion = async (eid, v, status) => {
    const st = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
    const e = st.db.estimates.find((x) => x.id === eid);
    for (const o of e.doc.options) for (const l of o.lines) if (l.source && l.source.module === "gutters") l.source.engineVersion = v;
    if (status) e.status = status;
    await h.seed(DB_KEY, st);
  };

  await h.go("/today");
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, DB_KEY, { timeout: 8000 });
  await h.go(`/lead/${lead.id}`);
  await tid("module-gutters-measure").getByRole("button").click();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.4;
  await p.mouse.move(b.x + b.width * 0.25, y);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(b.x + b.width * (0.25 + (0.45 * i) / 12), y);
  await p.mouse.up();
  await skipLength(p);
  await tid("draw-saved").waitFor({ timeout: 5000 });
  await p.waitForFunction(() => !!new URL(location.href).searchParams.get("m"), null, { timeout: 8000 });
  const mid = new URL(p.url()).searchParams.get("m");
  await openView(p);
  await tid("view-action-make").getByRole("button").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  const eid = new URL(p.url()).searchParams.get("id");
  await p.waitForFunction(([k, m]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.measurements || []).some((x) => x.id === m && x.status === "ready"), [DB_KEY, mid], { timeout: 8000 });

  // the lines carry the engine's version; nothing is said while it is the current one
  const now = (await versions(eid, mid))[0];
  h.expect(/^\d+\.\d+\.\d+$/.test(now || ""), "the lines carry the engine's version: " + now);
  await h.go(`/estimate/${eid}`);
  await tid("est-pdf").waitFor({ timeout: 8000 });
  h.expect((await tid("module-gutters-engine").count()) === 0, "no word while the engine is the same");

  // an older engine computed them
  await setVersion(eid, "0.0.1");
  await h.go(`/estimate/${eid}`);
  await tid("module-gutters-engine").waitFor({ timeout: 8000 });
  h.expect((await tid("module-gutters-stale").count()) === 0, "the drawing is as estimated: only the engine's word");
  await h.shot("engine");
  await h.go(`/module/gutters/view?m=${encodeURIComponent(mid)}`);
  await tid("view-engine-changed").waitFor({ timeout: 8000 });
  h.expect(/Расчёт изменился — обновите/.test(await tid("view-engine-changed").innerText()), "the chip on the review");

  // «Обновить из замера»: the same estimate, the current version, no words
  await h.go(`/estimate/${eid}`);
  await tid("module-gutters-engine-update").getByRole("button").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  h.expect(new URL(p.url()).searchParams.get("id") === eid, "the same estimate");
  await p.waitForFunction(([k, id, v]) => { const e = ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.estimates || []).find((x) => x.id === id); const vs = (e?.doc?.options || []).flatMap((o) => o.lines).filter((l) => l.source && l.source.module === "gutters").map((l) => l.source.engineVersion); return vs.length > 0 && vs.every((x) => x === v); }, [DB_KEY, eid, now], { timeout: 8000 });
  await h.go(`/estimate/${eid}`);
  await tid("est-pdf").waitFor({ timeout: 8000 });
  h.expect((await tid("module-gutters-engine").count()) === 0, "the word is gone after the update");

  // signed: only told (the review's chip says «после подписи»), nothing offered
  await setVersion(eid, "0.0.1", "approved");
  await h.go(`/module/gutters/view?m=${encodeURIComponent(mid)}`);
  await tid("view-engine-changed").waitFor({ timeout: 8000 });
  h.expect(/после подписи/.test(await tid("view-engine-changed").innerText()), "a signed estimate: «Расчёт изменился после подписи»");
  h.expect((await tid("view-action-update").count()) === 0, "no «Обновить» for a signed estimate");
  await h.shot("signed");
};
