/**
 * e2e 478 — «Удалить замер», когда по нему есть смета (#2013; spec 33-gutters-workflow «Удалить замер», С1, С5). Every view.
 * A lead's measurement with a draft estimate: «Удалить замер» asks first; «Отмена» — nothing changes; «Удалить замер» — the
 * measurement goes, the estimate stays with the same total and its lines no longer «from the measurement»; «Отменить» — both back.
 * Finds things by testID and the store; waits on what it checks.
 */
const { skipLength, savedOnce, openView } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const ofM = (l, mid) => l.source && l.source.module === "gutters" && l.source.measurementId === mid;
  const hasM = async (mid) => ((await db())?.moduleData?.gutters?.measurements ?? []).some((m) => m.id === mid);

  await h.go("/today");
  const lead = (await db()).leads.find((l) => l.propertyId) || (await db()).leads[0];
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, DB_KEY, { timeout: 8000 });

  // a lead's measurement with one run, its estimate (a draft)
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
  await savedOnce(p);
  await p.waitForFunction(() => !!new URL(location.href).searchParams.get("m"), null, { timeout: 8000 });
  const mid = new URL(p.url()).searchParams.get("m");
  await openView(p);
  await tid("view-action-make").getByRole("button").click();
  await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  const eid = new URL(p.url()).searchParams.get("id");
  await p.waitForFunction(([k, id, m]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.estimates ?? []).some((e) => e.id === id && (e.doc?.options ?? []).some((o) => o.lines.some((l) => l.source && l.source.measurementId === m))), [DB_KEY, eid, mid], { timeout: 8000 });
  const total0 = ((await db()).estimates.find((e) => e.id === eid) || {}).totalCents;

  const askDelete = async () => {
    await tid("view-more").getByRole("button").click();
    await tid("view-more-delete").click();
    await tid("m-delete-ask").waitFor({ timeout: 5000 });
  };

  // С1: asked first, the words say what happens to the estimate; С5: «Отмена» — nothing changes
  await h.go(`/module/gutters/view?m=${encodeURIComponent(mid)}`);
  await tid("view-head").waitFor({ timeout: 8000 });
  await askDelete();
  h.expect((await tid("m-delete-draft").count()) === 1 && (await tid("m-delete-sent").count()) === 0, "the question names the draft estimate (its lines become ordinary)");
  await h.shot("ask");
  await tid("m-delete-no").getByRole("button").click();
  await tid("m-delete-ask").waitFor({ state: "detached", timeout: 5000 });
  h.expect(await hasM(mid), "«Отмена»: the measurement is there");

  // «Удалить замер»: the measurement goes, the estimate stays (the same total), its lines are ordinary
  await askDelete();
  await tid("m-delete-yes").getByRole("button").click();
  await p.waitForFunction(([k, m]) => !((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.measurements ?? []).some((x) => x.id === m), [DB_KEY, mid], { timeout: 8000 });
  const e1 = (await db()).estimates.find((e) => e.id === eid);
  h.expect(!!e1 && e1.totalCents === total0, `the estimate stays with the same total (${total0} → ${e1 && e1.totalCents})`);
  h.expect(!(e1.doc.options || []).some((o) => o.lines.some((l) => ofM(l, mid))), "its lines are no longer «from the measurement»");
  await h.shot("deleted");

  // «Отменить»: both back
  await p.getByTestId("toast-undo").locator("visible=true").last().click();
  await p.waitForFunction(([k, m, id]) => {
    const d = (JSON.parse(localStorage.getItem(k) || "null") || {}).db || {};
    const back = (d.moduleData?.gutters?.measurements ?? []).some((x) => x.id === m);
    const e = (d.estimates ?? []).find((x) => x.id === id);
    return back && !!e && (e.doc?.options ?? []).some((o) => o.lines.some((l) => l.source && l.source.measurementId === m));
  }, [DB_KEY, mid, eid], { timeout: 8000 });
};
