/**
 * e2e 227 — «Замеры», дом модуля (основатель 11.11: «открываешь модуль — там кнопка „Новый замер“, внутри — карточки
 * замеров»; docs/specs/33-gutters-workflow.md П25.3 А, П25.4, PR-H1). Every view.
 * - four measurements on the phone: a draft for nobody, a lead's without an estimate, a client's with a sent estimate,
 *   a client's with an approved one → the chips count them (Все 4 · Черновики 1 · Без сметы 1 · Со сметой 1 · Подписаны 1),
 *   each card says its state with a word;
 * - a chip shows only its cards and is kept after a reload; the search finds by a client's name and by a lead's phone;
 *   an empty chip says so and «Показать все» brings the whole list back;
 * - a card opens the measurement's card: 390 / 820 — its own screen; 1280 — beside the list (ListPanel), «⤢ Открыть» —
 *   its own screen.
 * Finds things by testID; waits on what it checks.
 */
const DB_KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const desktop = h.layout.width >= 1280;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const cards = () => p.locator('[data-testid^="measurement-"]:visible');
  const ids = () => cards().evaluateAll((xs) => xs.map((x) => x.getAttribute("data-testid").slice("measurement-".length)));
  const chip = (name) => tid("filter-lane").getByRole("radio", { name: new RegExp(`^${name}`) });
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const db = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db, DB_KEY);

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await waitFor(async () => !!(await db())?.company?.modules?.gutters?.enabled, "the trial is on");

  // the four measurements and two estimates of them (copies of a demo estimate with one line of the measurement)
  const d0 = await db();
  const lead = d0.leads.find((l) => l.phone && !l.propertyId) || d0.leads.find((l) => l.phone);
  const client = d0.customers.find((c) => d0.properties.some((q) => q.customerId === c.id));
  const place = d0.properties.find((q) => q.customerId === client.id);
  h.expect(!!lead && !!client && !!place, "the demo has a lead with a phone and a client with an address");
  await p.waitForTimeout(400); // nothing left for the store to write (it writes on leaving within 250 ms)
  await p.evaluate(({ k, leadId, propertyId }) => {
    const st = JSON.parse(localStorage.getItem(k));
    const now = Date.now();
    const at = (min) => new Date(now - min * 60000).toISOString();
    const M = (id, x) => ({ id, label: null, status: "draft", propertyId: null, leadId: null, accuracy: "tape", ...x });
    const run = (id, m) => ({ id, measurementId: m, kind: "run", geom: { a: [0, 0], b: [240, 0] }, attrs: {}, confidence: "drawn" });
    st.db.moduleData = st.db.moduleData || {};
    st.db.moduleData.gutters = {
      measurements: [
        M("e2e227-draft", { updatedAt: at(1) }),
        M("e2e227-lead", { leadId, updatedAt: at(2) }),
        M("e2e227-sent", { propertyId, status: "ready", updatedAt: at(3) }),
        M("e2e227-signed", { propertyId, status: "ready", updatedAt: at(4) }),
      ],
      elements: [run("e2e227-r1", "e2e227-sent"), run("e2e227-r2", "e2e227-signed"), run("e2e227-r3", "e2e227-draft")],
    };
    const base = st.db.estimates.find((e) => e.doc?.options?.[0]?.lines?.length);
    const copy = (id, status, m) => {
      const e = JSON.parse(JSON.stringify(base));
      e.id = id;
      e.status = status;
      const l = e.doc.options[0].lines[0];
      l.source = { module: "gutters", measurementId: m, at: at(5) };
      return e;
    };
    st.db.estimates.push(copy("e2e227-est-sent", "sent", "e2e227-sent"), copy("e2e227-est-ok", "approved", "e2e227-signed"));
    localStorage.setItem(k, JSON.stringify(st));
    // a chip kept from an earlier view of the same browser: start from «Все»
    localStorage.removeItem("octo.filter.gutters.measurements.v1.status");
  }, { k: DB_KEY, leadId: lead.id, propertyId: place.id });

  await h.go("/module/gutters/list");
  await waitFor(async () => (await cards().count()) === 4, "four cards");
  // the chips count every state
  for (const [name, n] of [["Все", 4], ["Черновики", 1], ["Без сметы", 1], ["Со сметой", 1], ["Подписаны", 1]]) {
    h.expect((await chip(name).count()) === 1 && new RegExp(`· ${n}$`).test((await chip(name).innerText()).trim()), `the chip «${name} · ${n}»`);
  }
  const text = async (id) => (await tid(`measurement-${id}`).innerText()).replace(/\n/g, " | ");
  h.expect(/Без клиента/.test(await text("e2e227-draft")) && /Черновик/.test(await text("e2e227-draft")), `the draft: «Без клиента», «Черновик» (${await text("e2e227-draft")})`);
  h.expect(/Лид: /.test(await text("e2e227-lead")) && /Без сметы/.test(await text("e2e227-lead")), `the lead's: «Лид: …», «Без сметы» (${await text("e2e227-lead")})`);
  h.expect((await text("e2e227-sent")).includes(client.name) && /Отправлена/.test(await text("e2e227-sent")), `the client's: its name, «Отправлена» (${await text("e2e227-sent")})`);
  h.expect(/Подписан/.test(await text("e2e227-signed")), `the signed one: «Подписан» (${await text("e2e227-signed")})`);
  await h.shot("all");

  // a chip shows its cards; it is kept on this device
  await chip("Подписаны").click();
  await waitFor(async () => JSON.stringify(await ids()) === JSON.stringify(["e2e227-signed"]), "«Подписаны»: the signed one only");
  await p.waitForTimeout(400);
  await h.go("/module/gutters/list");
  await waitFor(async () => JSON.stringify(await ids()) === JSON.stringify(["e2e227-signed"]), "after a reload: still «Подписаны»");
  await h.shot("signed");
  await chip("Все").click();
  await waitFor(async () => (await cards().count()) === 4, "«Все» again");

  // the search: a client's name, a lead's phone (its digits)
  // the field folds a moment after a blur (a chip pressed): open it again when it is folded; the field is waited for
  const search = async (q) => {
    const field = p.getByTestId("filter-search-field");
    // an open field without the focus is folding (a blur): wait until it is gone, then open it again
    if ((await field.count()) && !(await field.evaluate((el) => el === document.activeElement))) await field.waitFor({ state: "detached", timeout: 5000 });
    if (!(await field.count())) {
      await tid("filter-search-toggle").click();
      await tid("filter-search-field").waitFor({ timeout: 5000 });
    }
    await tid("filter-search-field").fill(q);
  };
  await search(client.name.split(" ")[0]);
  await waitFor(async () => { const xs = await ids(); return xs.includes("e2e227-sent") && xs.includes("e2e227-signed") && !xs.includes("e2e227-draft"); }, "by the client's name");
  await search(lead.phone.replace(/\D/g, "").slice(-7));
  await waitFor(async () => (await ids()).includes("e2e227-lead") && !(await ids()).includes("e2e227-sent"), "by the lead's phone");
  // an empty chip: it says so, «Показать все» — the whole list (of the search)
  await chip("Без сметы").click();
  await waitFor(async () => (await cards().count()) === 1, "the lead's in «Без сметы»");
  await search("zzzz-nobody");
  await waitFor(async () => (await cards().count()) === 0 && (await tid("measurements-show-all").count()) === 1, "an empty chip says so");
  await h.shot("empty");
  await search("");
  await waitFor(async () => (await cards().count()) === 1, "the search cleared");
  await chip("Все").click();
  await waitFor(async () => (await cards().count()) === 4, "all four");

  // a card opens the measurement's card
  await tid("measurement-e2e227-sent").click();
  if (desktop) {
    await tid("list-panel").waitFor({ timeout: 8000 });
    await waitFor(() => new URL(p.url()).searchParams.get("open") === "e2e227-sent", "1280: the panel's address");
    await tid("list-panel").getByTestId("view-screen").waitFor({ timeout: 8000 });
    h.expect((await cards().count()) === 4, "1280: the list stays beside it");
    h.expect((await tid("measurement-e2e227-sent").getAttribute("aria-current")) === "true", "1280: the card is chosen");
    await h.shot("panel");
    await tid("list-panel-open").getByRole("button").click();
  }
  await waitFor(() => /\/module\/gutters\/view/.test(p.url()) && new URL(p.url()).searchParams.get("m") === "e2e227-sent", `the measurement's card (${p.url()})`);
  await tid("view-screen").waitFor({ timeout: 8000 });
  await h.shot("card");
};
