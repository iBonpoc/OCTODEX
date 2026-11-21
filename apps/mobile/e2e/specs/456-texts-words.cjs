/**
 * e2e 456 — #1427 «Тексты экранов», слова (DS §4.2, §4.4 п.1, §4.5), the director, every view, by testID:
 * - a tech's load in the visit form is a counted phrase: «1 выезд · …», «3 выезда · …» — never «выезд(а)» (Intl.PluralRules);
 * - «Команда» → the crews' load: «3 выезда сегодня», not «Выездов сегодня: 3» (v2: the Home lists visits as rows);
 * - a paid invoice has one word: its row says «Оплачен», never «Оплачено» (v2: the group is the money «Оплачено · $X»);
 * - a job's visit says «4 ч», not «240 мин»;
 * - «К какой работе» on a new expense offers the job (its number and title), not the client's name;
 * - a negative profit is «−$…» with the minus sign U+2212, never a hyphen «-$».
 */
const RU_FORM = { one: "выезд", few: "выезда", many: "выездов" };
const visitsWord = (n) => RU_FORM[new Intl.PluralRules("ru-RU").select(n)] ?? "выезда";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const textOf = async (id) => {
    await tid(id).waitFor({ timeout: 8000 });
    await tid(id).scrollIntoViewIfNeeded();
    return (await tid(id).innerText()).replace(/\s+/g, " ").trim();
  };
  const db = await (async () => {
    await h.go("/today");
    return h.db();
  })();

  // 039: the visit form — every tech with visits that day says «N выезд/выезда/выездов · …»
  await h.go("/job/schedule?jobId=j1");
  let counted = 0;
  for (const m of db.members.filter((x) => x.roles.includes("tech") && !x.pending)) {
    const row = await textOf(`vf-tech-${m.id}`);
    h.expect(!/\(а\)|\(s\)/.test(row), `no «выезд(а)» in the load of ${m.name}: ${row}`);
    const n = row.match(/(\d+) (выезд\S*) ·/);
    if (n) {
      counted++;
      h.expect(n[2] === visitsWord(Number(n[1])), `«${n[1]} ${visitsWord(Number(n[1]))}» for ${m.name}: ${row}`);
    }
  }
  h.expect(counted > 0, "the demo has a tech with visits on the form's day");

  // 083: the crews' load «N выездов сегодня» (v2 #2350: the Home lists the visits as rows, the count per person is on «Команда»)
  await h.go("/team");
  const crew = p.locator('[data-testid="list-card"]').locator("visible=true");
  await crew.first().waitFor({ timeout: 8000 });
  const loads = (await crew.allInnerTexts()).map((x) => x.replace(/\s+/g, " ")).map((x) => x.match(/(\d+) (выезд\S*) сегодня/)).filter(Boolean);
  h.expect(loads.length > 0 && loads.every((cn) => cn[2] === visitsWord(Number(cn[1]))), `crew: «N выездов сегодня» (${loads.map((x) => x[0]).join(" | ")})`);
  h.expect(!/Выездов сегодня:/.test(await h.text()), "no «Выездов сегодня: N»"); // i18n-old: ok

  // 042/043: a paid invoice — one word «Оплачен» on the row; v2 (#2350, BUILD-SPEC 2.13) the group is the money «Оплачено · $X»
  await h.go("/invoice?f=paid");
  const group = await textOf("invoice-list-group-paid");
  h.expect(/^Оплачено · \$[\d,]+/.test(group), `the group is the paid money «Оплачено · $X» (${group.slice(0, 80)})`);
  const rows = p.locator('[data-testid="invoice-list-group-paid"] [data-testid^="invoice-row-"]').locator("visible=true");
  await rows.first().waitFor({ timeout: 8000 });
  for (const c1 of (await rows.allInnerTexts()).map((x) => x.replace(/\s+/g, " "))) h.expect(/Оплачен(?!о)/.test(c1) && !/Оплачено/.test(c1), `the paid row: «Оплачен», no «Оплачено» (${c1.slice(0, 160)})`);

  // 037: a job's visit of 240 minutes says «4 ч»
  const long = db.visits.find((v) => v.jobId === "j1" && !v.allDay && v.durationMin === 240);
  h.expect(!!long, "the demo has a 240-minute visit on j1");
  await h.go("/job/j1");
  // v2 (#2350): a job's visits are its section «Выезды» (ViewTabs `job-screen-sections-visits`)
  await tid("job-screen-sections-visits").click();
  const vt = await textOf(`job-visit-${long.id}`);
  h.expect(/· 4 ч(?!\S)/.test(vt) && !/240 мин/.test(vt), `the visit says «4 ч» (${vt})`);

  // 053: «К какой работе» — the job, not the client
  await h.go("/expense/new");
  const jt = await textOf("expense-job");
  const today = db.visits.find((v) => v.jobId && db.jobs.find((j) => j.id === v.jobId)?.number && jt.includes(db.jobs.find((j) => j.id === v.jobId).number));
  h.expect(!!today, `the job's number is offered (${jt})`);

  // 041: a negative amount — «−$», not «-$» (a planted expense bigger than the job's money)
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  raw.db.expenses = [...(raw.db.expenses ?? []), { id: "e2e-456-x", jobId: "j1", vendor: "Home Depot", category: "materials", amountCents: 999999, at: new Date().toISOString(), memberId: raw.db.me }];
  await h.seed("octo.db.v5", raw);
  await h.go("/job/j1");
  // v2: the profit is on the job's «Обзор» (job-profit), not under «Расходы»
  await tid("job-screen-sections-overview").click();
  const profit = await textOf("job-profit");
  h.expect(/(^|\s)−\$[\d,]/.test(profit) && !/-\$|-\d/.test(profit), `a loss with «−» (U+2212): ${profit}`);
  await h.shot("profit");
};
