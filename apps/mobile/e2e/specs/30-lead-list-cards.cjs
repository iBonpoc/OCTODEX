/**
 * The leads list in the v2 List template (#2350; was the list cards of step 10а, PR3), every view (3 widths × 2 themes), by testID.
 * - a row `lead-row-<id>`: the name and ONE line «где · что · город» — no phone, no number, no lead price on the row;
 * - its one quick action — SMS for whoever asked for SMS, else a call — writes exactly what the LEAD PAGE writes (touchLead /
 *   call result): same lead fields, same history;
 * - «No answer» twice → the counter grows; the next call's sheet says how many tries there were;
 * - a technician never sees the lead's price: «Продажи» send him to his visits, and neither they nor «Клиенты» show it.
 */
exports.run = async (h) => {
  const p = h.page;
  const noOpen = () => p.evaluate(() => { window.open = () => null; });
  const lead = async (id) => (await h.db()).leads.find((l) => l.id === id);
  const acts = async (id) => (await h.db()).activities.filter((a) => a.subjectId === id).map((a) => `${a.kind}:${a.meta?.outcome ?? a.meta?.to ?? ""}`).sort();
  const shape = (l) => ({ status: l.status, replied: !!l.firstResponseAt, attempts: l.callAttempts ?? 0 });
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const answer = async (text) => { await h.sheet().getByRole("button", { name: text }).click(); await p.waitForTimeout(400); };

  await h.go("/leads");
  // Kevin (new) asked for SMS, Tom (replied) for a call: their rows' one quick action is that
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.leads?.length, null, { timeout: 8000 });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw.db.leads = raw.db.leads.map((l) => (l.id === "l1" ? { ...l, preferredContact: "sms" } : l.id === "l3" ? { ...l, preferredContact: "call" } : l));
  await h.seed("octo.db.v5", raw); // from a page without the app (CHECKS §9 №12)
  await h.go("/inbox?tab=leads");
  await p.waitForURL(/\/leads/);
  await noOpen();
  const db = await h.db();
  const kevin = db.leads.find((l) => l.id === "l1");

  // the row: the name and what is needed; no phone, no number, no price
  const txt = await tid("lead-row-l1").innerText();
  h.expect(txt.includes(kevin.name) && txt.includes(kevin.service), `the row says who and what: ${txt.slice(0, 160)}`);
  for (const s of [kevin.number, kevin.phone, "$45.00"]) h.expect(!txt.includes(s), `no «${s}» on the row`);
  await h.shot("list");

  // SMS from the row vs from the lead page: the same
  const before = shape(kevin);
  await tid("lead-row-sms-l1").click();
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.leads.find((l) => l.id === "l1")?.firstResponseAt, null, { timeout: 5000 });
  const viaCard = await lead("l1");
  h.expect(before.replied === false && viaCard.firstResponseAt && viaCard.status === "replied", `SMS from the row stops the timer (${JSON.stringify(shape(viaCard))})`);
  await h.go("/lead/l2");
  await noOpen();
  await tid("lead-sms").click();
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db.leads.find((l) => l.id === "l2")?.firstResponseAt, null, { timeout: 5000 });
  const viaPage = await lead("l2");
  h.expect(JSON.stringify(shape(viaPage)) === JSON.stringify(shape(viaCard)), `SMS: page ${JSON.stringify(shape(viaPage))} = row ${JSON.stringify(shape(viaCard))}`);
  h.expect(JSON.stringify(await acts("l2")).replace(/l2/g, "") === JSON.stringify(await acts("l1")).replace(/l1/g, ""), "SMS: same history records");
  await h.go("/leads");
  await noOpen();

  // calls on Tom (replied): «No answer» twice from the row → counter 2, the next call's sheet says so
  for (let i = 0; i < 2; i++) {
    await tid("lead-row-tel-l3").click();
    await h.sheet().getByRole("button", { name: "Не ответил" }).waitFor();
    await answer("Не ответил");
  }
  h.expect((await lead("l3")).callAttempts === 2, `missed calls counted (${(await lead("l3")).callAttempts})`);
  await tid("lead-row-tel-l3").click();
  await h.sheet().getByRole("button", { name: "Да, поговорили" }).waitFor();
  h.expect(/\b2\b/.test(await h.sheet().innerText()), "the call sheet says two tries");
  await h.shot("missed");

  // answered: from the row (Tom) and from the lead page (Linda) → the same lead fields
  await answer("Да, поговорили");
  const tomAfter = await lead("l3");
  const linda = db.leads.find((l) => l.id === "l5");
  await h.go("/lead/l5");
  await noOpen();
  await tid("lead-call").click();
  await h.sheet().getByRole("button", { name: "Да, поговорили" }).waitFor();
  await answer("Да, поговорили");
  const lindaAfter = await lead("l5");
  h.expect(tomAfter.callAttempts === 0 && lindaAfter.callAttempts === 0 && !!tomAfter.firstResponseAt === !!lindaAfter.firstResponseAt && tomAfter.status === "replied" && lindaAfter.status === linda.status,
    `answered: row ${JSON.stringify(shape(tomAfter))} vs page ${JSON.stringify(shape(lindaAfter))}`);
  const lastCall = async (id) => (await h.db()).activities.find((a) => a.subjectId === id && a.kind === "call")?.meta?.outcome;
  h.expect((await lastCall("l3")) === "answered" && (await lastCall("l5")) === "answered", "answered call is in the history, row and page alike");

  // technician: «Продажи» are closed (route guard) — he lands on his visits; no lead price there nor on «Клиенты»
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/inbox?tab=leads");
  await p.waitForURL(/\/visits/, { timeout: 5000 });
  for (const path of ["/visits", "/clients"]) {
    if (path !== "/visits") await h.go(path);
    const body = await p.locator("body").innerText();
    h.expect(!/— \$\d/.test(body), `tech sees no lead price on ${path}`);
  }
};
