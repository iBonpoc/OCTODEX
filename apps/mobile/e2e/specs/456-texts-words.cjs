/**
 * e2e 456 — #1427 «Тексты экранов», слова (DS §4.2, §4.4 п.1, §4.5), the director, every view, by testID:
 * - a tech's load in the visit form is a counted phrase: «1 выезд · …», «3 выезда · …» — never «выезд(а)» (Intl.PluralRules);
 * - «Сегодня» → crew cards: «3 выезда сегодня», not «Выездов сегодня: 3»;
 * - a paid invoice has one word: the filter, the group and the card chip say «Оплачен», never «Оплачено»;
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

  // 083: «Сегодня» → «Бригады сейчас»: «N выездов сегодня»
  await h.go("/today");
  const crew = p.locator('[data-testid="crew-card"]').locator("visible=true");
  await crew.first().waitFor({ timeout: 8000 });
  const ct = (await crew.first().innerText()).replace(/\s+/g, " ");
  const cn = ct.match(/(\d+) (выезд\S*) сегодня/);
  h.expect(!!cn && cn[2] === visitsWord(Number(cn[1])) && !/Выездов сегодня:/.test(ct), `crew card: «N выездов сегодня» (${ct.slice(0, 160)})`); // i18n-old: ok

  // 042/043: a paid invoice — one word
  await h.go("/invoice?f=paid");
  const group = await textOf("invoice-group-paid");
  h.expect(/^Оплачен · \d+/.test(group), `the group says «Оплачен · N» (${group})`);
  const lane = (await tid("filter-bar").innerText()).replace(/\s+/g, " ");
  h.expect(/Оплачен/.test(lane) && !/Оплачено/.test(lane), `the filter says «Оплачен» (${lane})`);
  const cards = p.locator('[data-testid="list-card"]').locator("visible=true");
  await cards.first().waitFor({ timeout: 8000 });
  const c1 = (await cards.first().innerText()).replace(/\s+/g, " ");
  h.expect(/Оплачен/.test(c1) && !/Оплачено/.test(c1), `the paid card: «Оплачен», no «Оплачено» (${c1.slice(0, 160)})`);

  // 037: a job's visit of 240 minutes says «4 ч»
  const long = db.visits.find((v) => v.jobId === "j1" && !v.allDay && v.durationMin === 240);
  h.expect(!!long, "the demo has a 240-minute visit on j1");
  await h.go("/job/j1");
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
  await tid("job-tab-expenses").click();
  const profit = await textOf("job-profit");
  h.expect(/^−\$/.test(profit) && !/-\$|-\d/.test(profit), `a loss with «−» (U+2212): ${profit}`);
  await h.shot("profit");
};
