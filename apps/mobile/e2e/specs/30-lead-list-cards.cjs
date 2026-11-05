/**
 * Leads list on the new list cards (step 10а, PR3), every view (3 widths × 2 themes).
 * - card: number + phone, source with the lead's price (office only), request; no «…»; edges aligned;
 * - a call / SMS from the CARD writes exactly what the LEAD PAGE writes (touchLead / call result): same lead fields, same history;
 * - «No answer» twice → the counter grows and the card shows «Не дозвонились ×2»;
 * - a technician never sees the lead's price.
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width >= 1280;
  const noOpen = () => p.evaluate(() => { window.open = () => null; });
  const lead = async (id) => (await h.db()).leads.find((l) => l.id === id);
  const acts = async (id) => (await h.db()).activities.filter((a) => a.subjectId === id).map((a) => `${a.kind}:${a.meta?.outcome ?? a.meta?.to ?? ""}`).sort();
  const shape = (l) => ({ status: l.status, replied: !!l.firstResponseAt, attempts: l.callAttempts ?? 0 });
  const cardOf = (name) => p.getByRole("button", { name, exact: true }).first();
  const callOn = (phone) => p.getByRole("button", { name: new RegExp(`^Позвонить: ${phone.replace(/[()]/g, "\\$&")}`) }).first();
  const answer = async (text) => { await h.sheet().getByRole("button", { name: text }).click(); await p.waitForTimeout(400); };

  await h.go("/inbox?tab=leads");
  await noOpen();
  const db = await h.db();
  const kevin = db.leads.find((l) => l.id === "l1");

  // card content: number + phone, source with price (director), request
  const txt = await cardOf(kevin.name).innerText();
  for (const s of [kevin.number, kevin.phone, "Thumbtack — $45", kevin.service]) h.expect(txt.includes(s), `card shows «${s}»: ${txt.slice(0, 160)}`);
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…» in the list");
  await p.evaluate(() => window.scrollTo(0, 0));
  await checkCardAlignment(h, { searchPlaceholder: "Имя, телефон, адрес, услуга" });
  await h.shot("list");

  // SMS (phone / tablet cards; desktop rows have call + reply only): card vs lead page write the same
  if (!wide) {
    const before = shape(kevin);
    await p.getByRole("button", { name: new RegExp(`^SMS: ${kevin.phone.replace(/[()]/g, "\\$&")}`) }).first().click();
    await p.waitForTimeout(400);
    const viaCard = await lead("l1");
    h.expect(before.replied === false && viaCard.firstResponseAt && viaCard.status === "replied", `SMS from the card stops the timer (${JSON.stringify(shape(viaCard))})`);
    await h.go("/lead/l2");
    await noOpen();
    await h.click("Написать");
    const viaPage = await lead("l2");
    h.expect(JSON.stringify(shape(viaPage)) === JSON.stringify(shape(viaCard)), `SMS: page ${JSON.stringify(shape(viaPage))} = card ${JSON.stringify(shape(viaCard))}`);
    h.expect(JSON.stringify(await acts("l2")).replace(/l2/g, "") === JSON.stringify(await acts("l1")).replace(/l1/g, ""), "SMS: same history records");
    await h.go("/inbox?tab=leads");
    await noOpen();
  }

  // calls on Tom (replied): «No answer» twice from the card → counter 2 and the sign on the card
  const tom = db.leads.find((l) => l.id === "l3");
  for (let i = 0; i < 2; i++) {
    await callOn(tom.phone).click();
    await p.waitForTimeout(400);
    await answer("Не ответил");
  }
  h.expect((await lead("l3")).callAttempts === 2, `missed calls counted (${(await lead("l3")).callAttempts})`);
  h.expect((await cardOf(tom.name).innerText()).includes("Не дозвонились ×2"), "card shows «Не дозвонились ×2»");
  await h.shot("missed");

  // answered: from the card (Tom) and from the lead page (Linda) → the same lead fields
  await callOn(tom.phone).click();
  await p.waitForTimeout(400);
  await answer("Да, поговорили");
  const tomAfter = await lead("l3");
  const linda = db.leads.find((l) => l.id === "l5");
  await h.go("/lead/l5");
  await noOpen();
  await h.click("Позвонить");
  await answer("Да, поговорили");
  const lindaAfter = await lead("l5");
  h.expect(tomAfter.callAttempts === 0 && lindaAfter.callAttempts === 0 && !!tomAfter.firstResponseAt === !!lindaAfter.firstResponseAt && tomAfter.status === "replied" && lindaAfter.status === linda.status,
    `answered: card ${JSON.stringify(shape(tomAfter))} vs page ${JSON.stringify(shape(lindaAfter))}`);
  const lastCall = async (id) => (await h.db()).activities.find((a) => a.subjectId === id && a.kind === "call")?.meta?.outcome;
  h.expect((await lastCall("l3")) === "answered" && (await lastCall("l5")) === "answered", "answered call is in the history, card and page alike");

  // technician: no lead price anywhere on the list
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/inbox?tab=leads");
  const body = await p.locator("body").innerText();
  h.expect(!body.includes("$45"), "tech does not see the lead price");
};
