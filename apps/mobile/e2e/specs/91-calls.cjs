/**
 * Wave 6-2 «Звонки» (docs/specs/20 §5, §7, §9; S2): «＋ Записать звонок» asks «кому», the outcome is required;
 * «Не ответил» on a new lead keeps it new (an attempt), «Поговорили» moves it to «replied» (S2); the call shows in
 * «Звонки» with the outcome and minutes, chips filter by outcome, the card opens the lead.
 * The bug fixed in 6-2: «Позвонить» on a closed lead wrote a call without an outcome (the server counts it as answered);
 * now it always asks «Дозвонились?».
 */
exports.run = async (h) => {
  const p = h.page;
  const wide = h.layout.width > 390;
  const plus = () => p.locator(wide ? '[data-testid="fab-header"]:visible' : '[data-testid="fab"]:visible');
  const record = async () => {
    await plus().click(); await p.waitForTimeout(400);
    await h.sheet().getByText("Записать звонок", { exact: true }).last().click(); await p.waitForTimeout(500);
  };

  await h.go("/calls");
  await record();
  let sheet = h.sheet();
  await sheet.getByPlaceholder("Лид или клиент").fill("Angela"); await p.waitForTimeout(300);
  await sheet.getByText("Angela Rossi", { exact: true }).first().click(); await p.waitForTimeout(300);
  await h.expectText(/Выберите итог — без него звонок не сохранить/, "the outcome is asked, nothing preselected");
  h.expect(await sheet.getByRole("button", { name: "Сохранить звонок" }).isDisabled(), "no save without an outcome");
  await sheet.getByText("Не ответил", { exact: true }).last().click();
  await sheet.getByRole("button", { name: "Длительность +1" }).click();
  await sheet.getByRole("button", { name: "Длительность +1" }).click();
  await sheet.getByPlaceholder("О чём договорились (необязательно)").fill("Left no message");
  await h.shot("sheet");
  await sheet.getByRole("button", { name: "Сохранить звонок" }).click(); await p.waitForTimeout(600);
  await h.expectText(/Звонок записан: не дозвонились/, "the toast");
  let db = await h.db();
  let l2 = db.leads.find((l) => l.id === "l2");
  h.expect(l2.status === "new" && (l2.callAttempts ?? 0) === 1, `«Не ответил»: the lead stays new, one attempt (${l2.status}, ${l2.callAttempts})`);
  const a = db.activities.find((x) => x.kind === "call" && x.subjectId === "l2");
  h.expect(a && a.meta.outcome === "no_answer" && a.meta.duration_min === "2" && a.body === "Left no message", "the call keeps its outcome, minutes and note");
  await h.expectText(/Angela Rossi.*Не ответил/, "the call is in «Звонки» with its outcome");
  await h.expectText(/2 мин/, "and its minutes");

  // «Поговорили»: S2 — the new lead becomes «replied»
  await record();
  sheet = h.sheet();
  await sheet.getByPlaceholder("Лид или клиент").fill("Angela"); await p.waitForTimeout(300);
  await sheet.getByText("Angela Rossi", { exact: true }).first().click(); await p.waitForTimeout(300);
  await sheet.getByText("Поговорили", { exact: true }).last().click();
  await sheet.getByRole("button", { name: "Сохранить звонок" }).click(); await p.waitForTimeout(600);
  db = await h.db();
  l2 = db.leads.find((l) => l.id === "l2");
  h.expect(l2.status === "replied", `«Поговорили» moves the new lead to replied (S2) (${l2.status})`);

  // chips by outcome, the card opens the lead
  await h.clickText("Не ответил · 1");
  h.expect((await p.getByText("Поговорили", { exact: true }).locator("visible=true").count()) === 0, "the chip shows only missed calls");
  await h.shot("list");
  await p.locator('[data-testid^="comms-"]:visible').first().click(); await p.waitForTimeout(700);
  h.expect(new URL(p.url()).pathname === "/lead/l2", `the card opens the lead (${p.url()})`);

  // the fixed bug: «Позвонить» on a closed lead asks the outcome and never writes a call without one
  await p.evaluate(() => {
    const k = "octo.db.v5";
    const s = JSON.parse(localStorage.getItem(k));
    s.db.leads = s.db.leads.map((l) => (l.id === "l1" ? { ...l, status: "lost", lostReason: "no_response" } : l));
    localStorage.setItem(k, JSON.stringify(s));
  });
  await h.go("/lead/l1");
  await p.getByRole("button", { name: "Позвонить" }).first().click(); await p.waitForTimeout(500);
  await h.expectText(/Дозвонились\?/, "a closed lead asks «Дозвонились?» too");
  await h.sheet().getByRole("button", { name: "Не ответил" }).click(); await p.waitForTimeout(500);
  db = await h.db();
  const calls = db.activities.filter((x) => x.kind === "call" && x.subjectId === "l1");
  h.expect(calls.length === 1 && calls[0].meta && calls[0].meta.outcome === "no_answer", "the call on the closed lead has its outcome");
  h.expect(db.leads.find((l) => l.id === "l1").status === "lost", "the closed lead stays closed");
};
