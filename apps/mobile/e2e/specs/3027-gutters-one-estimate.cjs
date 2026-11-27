/**
 * e2e 3027 — замер → смета сама, одна смета на весь объём (#3027; founder 26.11: «если замер уже есть, то смета уже должна быть автоматически
 * сделана… добавляю в смету ещё ремонт розетки… одна смета будет на весь объём работы»; #3047 А, #3048 А, решение #3054; spec 70). Every view.
 * A) a lead with nothing open: «Готово» → a draft estimate by itself, the measurement's section; a person's own line «Ремонт розетки» added;
 *    the drawing edited → «Готово» → the draft follows (more gutter), the outlet line stays as it was, still one estimate;
 * B) a lead whose estimate is SENT: a new measurement from the lead → «Готово» → it goes INTO that estimate (its section), the estimate stays
 *    the lead's one (its new version — the core saves a change of a sent estimate so), its own lines stay; «Открыть смету» on the card.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, openView, backToCanvas, savedOnce, freeLead } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);
  const waitFor = async (ok, what, tries = 400) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); v = await ok(); }
    h.expect(!!v, what);
  };
  const drawRun = async (at) => {
    const b = await p.getByTestId("draw-surface").boundingBox();
    const y = b.y + b.height * at;
    const a = [b.x + b.width * 0.25, y], z = [b.x + b.width * 0.7, y];
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((z[0] - a[0]) * i) / 12, y);
    await p.mouse.up();
    await skipLength(p);
  };
  const ofM = (mid) => (l) => l.source && l.source.module === "gutters" && l.source.measurementId === mid;
  const estimatesOf = async (mid) => ((await db())?.estimates ?? []).filter((e) => (e.doc?.options ?? []).some((o) => o.lines.some(ofM(mid))));
  const measure = async (leadId) => {
    await h.go(`/lead/${leadId}`);
    await tid("module-gutters-measure").waitFor({ timeout: 8000 });
    await tid("module-gutters-measure").getByRole("button").click();
    await tid("draw-surface").waitFor({ timeout: 8000 });
    await drawRun(0.4);
    await savedOnce(p);
    await waitFor(() => !!new URL(p.url()).searchParams.get("m"), "saved: the address names the measurement");
    return new URL(p.url()).searchParams.get("m");
  };

  await h.go("/today");
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => !!(await db())?.company?.modules?.gutters?.enabled, "the trial is on");
  const d0 = await db();

  // A) a lead with nothing open: «Готово» → a draft by itself
  const lead = freeLead(d0);
  h.expect(!!lead, "the demo has a lead with no estimate");
  const mid = await measure(lead.id);
  await openView(p);
  await waitFor(async () => (await estimatesOf(mid)).length === 1, "«Готово»: the estimate came by itself");
  const e1 = (await estimatesOf(mid))[0];
  h.expect(e1.status === "draft" && e1.leadId === lead.id, "a draft of the lead");
  await tid("view-action-open").waitFor({ timeout: 8000 });
  await h.shot("auto-draft");
  // a person's own line next to the drawing's: «Ремонт розетки» (in the editor it is an ordinary line; here it is put in the phone's data)
  const st = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), DB_KEY);
  st.db.estimates.find((x) => x.id === e1.id).doc.options[0].lines.push({ id: "e2e3027-outlet", name: "Ремонт розетки", group: "service", quantity: "1", unit: "ea", unitPriceCents: 9500 });
  await h.seed(DB_KEY, st);
  const gutterQty = async () => Number((((await db()).estimates.find((x) => x.id === e1.id)?.doc.options[0].lines) || []).find((l) => ofM(mid)(l) && l.source.section === "gutter")?.quantity || 0);
  const q1 = await gutterQty();
  // the drawing edited → «Готово» → the draft follows by itself; the outlet stays as it was
  await h.go(`/module/gutters/draw?m=${encodeURIComponent(mid)}`);
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await drawRun(0.65);
  await openView(p);
  await waitFor(async () => (await gutterQty()) > q1, `the draft followed the drawing (${q1} → ${await gutterQty()})`);
  const e1b = (await db()).estimates.find((x) => x.id === e1.id);
  const outlet = e1b.doc.options[0].lines.find((l) => l.id === "e2e3027-outlet");
  h.expect(!!outlet && outlet.name === "Ремонт розетки" && outlet.unitPriceCents === 9500 && !outlet.sectionId, "«Ремонт розетки» stays as it was, outside the drawing's section");
  h.expect((await estimatesOf(mid)).length === 1, "still one estimate");
  h.expect((e1b.doc.options[0].sections || []).filter((x) => x.id === `gutters:${mid}`).length === 1, "one section of the measurement");
  await backToCanvas(p).catch(() => {});

  // B) a lead whose estimate is sent: a new measurement goes INTO it
  const sent = d0.estimates.find((e) => e.status === "sent" && e.leadId && d0.leads.some((l) => l.id === e.leadId && !["won", "lost", "declined"].includes(l.status)));
  h.expect(!!sent, "the demo has a lead with a sent estimate");
  const mid2 = await measure(sent.leadId);
  await openView(p);
  await waitFor(async () => (await estimatesOf(mid2)).some((e) => e.id === sent.id), `the drawing went into ${sent.number} by itself`);
  const s2 = (await db()).estimates.find((x) => x.id === sent.id);
  // the core saves a change of a sent estimate as its new version, a draft (as a person's edit does): the client gets it by sending it again
  h.expect(s2.status === "draft" && s2.number === sent.number, `the same estimate ${sent.number}, its new version (${s2.status})`);
  const key = (l) => `${l.name}|${l.quantity}|${l.unitPriceCents}`;
  h.expect(sent.doc.options[0].lines.map(key).every((k) => s2.doc.options[0].lines.map(key).includes(k)), "its own lines stay");
  const secId = s2.doc.options[0].lines.find(ofM(mid2)).sectionId;
  h.expect(!!secId && s2.doc.options[0].lines.filter(ofM(mid2)).every((l) => l.sectionId === secId) && (s2.doc.options[0].sections || []).some((x) => x.id === secId), "the drawing's lines in its own section");
  h.expect((await db()).estimates.filter((e) => e.leadId === sent.leadId && e.status !== "declined").length === d0.estimates.filter((e) => e.leadId === sent.leadId && e.status !== "declined").length, "no second estimate for the lead");
  await h.shot("joined-sent");
  // its card: «Открыть смету» opens it — to look and send it again
  await tid("view-action-open").waitFor({ timeout: 8000 });
};
