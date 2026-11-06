/**
 * Wave 6-3 «Сообщения» (docs/specs/20 «6-3»): «＋ Новое сообщение» to a Spanish-speaking client's person while the app
 * is in Russian → the ready text is in Spanish (rule 7) → «Отправить» opens the phone's app and writes an sms event with
 * the text only (no phone) → «Отменить» takes it back (rule 5) → again → the person's card → the conversation says
 * «Открыто в приложении телефона» (never «доставлено») → «Открыть клиента ›». Without the network the event waits in the queue.
 */
const PERSON = "aaaaaaaa-1111-4111-8111-000000000093";
const queue = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("octo.queue.v1") || "[]").length);

exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const plus = () => p.locator(wide ? '[data-testid="fab-header"]:visible' : '[data-testid="fab"]:visible');
  await h.go("/today");
  await p.evaluate((id) => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.customers = s.db.customers.map((c) => (c.id === "c2" ? { ...c, people: [{ id, name: "David Kim", role: "main", language: "es", phones: [{ number: "(818) 555-0187", label: "mobile", primary: true }], emails: [] }] } : c));
    localStorage.setItem(k, JSON.stringify(s));
  }, PERSON);
  const write = async () => {
    await plus().click(); await p.waitForTimeout(500);
    const sheet = h.sheet();
    await sheet.getByPlaceholder("Имя или телефон").fill("David"); await p.waitForTimeout(300);
    await sheet.getByText("David Kim", { exact: true }).first().click(); await p.waitForTimeout(300);
    await sheet.getByText("Еду к вам", { exact: true }).last().click(); await p.waitForTimeout(300);
    return sheet;
  };

  await h.go("/messages");
  let sheet = await write();
  await h.expectText(/Язык клиента: Español/, "the client's language is shown");
  const text = await sheet.getByPlaceholder("Напишите сообщение").inputValue();
  h.expect(/^Hola David, le escribe .*Voy en camino\.$/.test(text), `the ready text is Spanish while the app is Russian (${text})`);
  await h.shot("sheet");
  await sheet.getByRole("button", { name: "Отправить", exact: true }).click(); await p.waitForTimeout(600);
  await h.expectText(/Открыто в приложении телефона: проверьте, что ушло/, "the toast says it was opened, not delivered");
  let db = await h.db();
  let ev = db.activities.find((a) => a.kind === "sms" && a.subjectId === "c2" && a.contactId === PERSON);
  h.expect(ev && ev.subjectType === "customer" && ev.direction === "out" && ev.body === text, "an sms event on the client with the person and the text");
  h.expect(!JSON.stringify(ev).includes("555-0187"), "the phone is not in the event");

  // «Отменить» (rule 5)
  await h.click("Отменить"); await p.waitForTimeout(500);
  db = await h.db();
  h.expect(!db.activities.some((a) => a.kind === "sms" && a.contactId === PERSON), "«Отменить»: the event is gone");

  // again — with a double tap on «Отправить» (two taps on the button itself: a mouse double click lands on the tab bar
  // under the closing sheet): one event, never two
  sheet = await write();
  await sheet.getByRole("button", { name: "Отправить", exact: true }).evaluate((el) => { el.click(); el.click(); }); await p.waitForTimeout(600);
  db = await h.db();
  h.expect(db.activities.filter((a) => a.kind === "sms" && a.contactId === PERSON).length === 1, "a double tap: one message");
  await p.getByRole("button", { name: "Отменить", exact: true }).last().waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  await p.getByTestId(`thread-p-${PERSON}`).locator("visible=true").first().click(); await p.waitForTimeout(800);
  h.expect(new URL(p.url()).pathname === `/messages/p-${PERSON}`, `the card opens the conversation (${p.url()})`);
  await h.expectText(/Hola David/, "the text is in the conversation");
  await h.expectText(/Открыто в приложении телефона · /, "«opened in the phone's app» with the time");
  h.expect(!/доставлено/i.test(await h.text()), "never «доставлено»");
  await h.shot("thread");
  await p.getByRole("button", { name: "Открыть клиента", exact: true }).click(); await p.waitForTimeout(800);
  h.expect(new URL(p.url()).pathname === "/client/c2", `«Открыть клиента» (${p.url()})`);

  // without the network: written at once, waits in the queue (in-app navigation keeps the offline switch)
  await h.go("/settings");
  await p.getByRole("switch", { name: "Проверка: режим без сети" }).click(); await p.waitForTimeout(300);
  if (!wide) { await p.getByTestId("back-more").locator("visible=true").first().click(); await p.waitForTimeout(600); }
  await p.getByTestId(wide ? "side-messages" : "tab-messages").locator("visible=true").first().click(); await p.waitForTimeout(700);
  const q0 = await queue(p);
  sheet = await write();
  await sheet.getByRole("button", { name: "Отправить", exact: true }).click(); await p.waitForTimeout(600);
  await h.expectText(/Без сети\. Сохранено, отправится позже/, "offline: saved and queued");
  h.expect((await queue(p)) === q0 + 1, "the message waits in the queue");
};
