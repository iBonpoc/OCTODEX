// e2e 81: «Напомнить» on an invoice (S20, wave 8), every view
/**
 * - the office opens an overdue invoice of a Spanish-speaking client → «Напомнить» → the sheet says «Язык клиента: Español»
 *   and shows the text in Spanish (rule 7: client's language ≠ app language);
 * - «Напомнить по SMS» opens the phone's SMS with that text and logs the reminder in the client's feed (linked to the invoice);
 *   the invoice then says «Напомнили …»;
 * - «Отменить» on the toast takes the second reminder back (rule 5);
 * - the technician has no «Напомнить».
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/invoice");
  const db0 = await h.db();
  const owes = (i) => i.totalCents > i.paidCents;
  const inv = db0.invoices.find((i) => owes(i) && db0.customers.find((c) => c.id === i.customerId)?.phone);
  h.expect(inv, "demo has an owed invoice of a client with a phone");
  // the client speaks Spanish; the app stays in Russian
  await p.evaluate((cid) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    // the client's main person speaks Spanish: the language lives on the person (docLanguageFor: person → client's main person → lead → company)
    const c = raw.db.customers.find((x) => x.id === cid);
    if (!c.people?.length) c.people = [{ id: `${c.id}-main`, name: c.name, role: "main", phones: [{ number: c.phone, label: "mobile", primary: true }], emails: [] }];
    for (const person of c.people) person.language = "es";
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, inv.customerId);
  await h.go(`/invoice/${inv.id}`);
  await p.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
  const reminders = async () => (await h.db()).activities.filter((a) => a.meta?.reminder === "1" && a.meta?.invoiceId === inv.id);

  await h.click("Напомнить");
  const sheet = p.locator('[aria-modal="true"]').filter({ hasText: "Напомнить клиенту" }).last();
  const st = await sheet.innerText();
  h.expect(st.includes("Язык клиента: Español"), "the sheet names the client's language");
  h.expect(/le recordamos/.test(st) && st.includes(inv.number), `Spanish text with the number: ${st.slice(0, 200)}`);
  h.expect(!/напоминаем/.test(st), "not in the app's language");
  await h.shot("sheet");
  await sheet.getByRole("button", { name: "Напомнить по SMS" }).click();
  await p.waitForTimeout(500);
  const opened = await p.evaluate(() => window.__opened);
  h.expect(opened.length === 1 && /^sms:/.test(opened[0]) && decodeURIComponent(opened[0]).includes("le recordamos"), `SMS opened with the Spanish text: ${opened[0]?.slice(0, 120)}`);
  await h.expectText(/Напоминание отмечено/, "toast");
  const r1 = await reminders();
  h.expect(r1.length === 1 && r1[0].subjectType === "customer" && r1[0].subjectId === inv.customerId && r1[0].kind === "sms" && r1[0].direction === "out", "logged in the client's feed, linked to the invoice");
  await h.go(`/invoice/${inv.id}`);
  await h.expectText(/Напомнили /, "the invoice shows when it was reminded");

  // a second reminder, taken back with «Отменить»
  await p.evaluate(() => { window.open = () => null; });
  await h.click("Напомнить");
  await p.locator('[aria-modal="true"]').filter({ hasText: "Напомнить клиенту" }).last().getByRole("button", { name: "Напомнить по SMS" }).click();
  await p.waitForTimeout(300);
  await h.click("Отменить");
  await p.waitForTimeout(300);
  h.expect((await reminders()).length === 1, "«Отменить» takes the second reminder back");

  // technician: no «Напомнить»
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go(`/invoice/${inv.id}`);
  h.expect((await p.getByRole("button", { name: "Напомнить", exact: true }).count()) === 0, "tech: no «Напомнить»");
};
