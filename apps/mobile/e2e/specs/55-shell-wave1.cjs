/**
 * Wave 1 of the app shell (docs/specs/13 §8): rights and leftovers.
 * - «Прибыль» by right (13 §3.4, §4): a finished visit showed the technician the job's profit, margin and revenue
 *   (visit/[id].tsx) although the job card already hid it — failed before the fix.
 * - «＋» shows only what works (13 §2.4): no «Голосовая заметка · Появится в волне 6»; «Фото» without an open visit
 *   today says so instead of silently doing nothing.
 * - «Для проверки» (offline, reset) — demo only (13 §2.3); in the demo it is still there.
 */
const setRole = (h, role) => h.page.evaluate((r) => localStorage.setItem("octo.role.v1", JSON.stringify(r)), role);

/** the visible ☰ (the tab navigator keeps visited tabs mounted, hidden, with their own ☰) */
const menuButton = async (p) => {
  const all = p.getByRole("button", { name: "Меню", exact: true });
  // a screen opened by a tab may still be rendering: wait up to 3 s
  for (let t = 0; t < 15; t++, await p.waitForTimeout(200))
    for (let i = (await all.count()) - 1; i >= 0; i--) if (await all.nth(i).isVisible()) return all.nth(i);
  throw new Error("no visible ☰");
};
exports.run = async (h) => {
  const p = h.page;
  await h.go("/more");
  const db = await h.db();
  const job = db.jobs.find((j) => db.properties.some((x) => x.id === j.propertyId));
  h.expect(job, "demo has a job at a property");
  // the only visit: a finished one of this job, the tech's own (so «Фото» below has no open visit today)
  await p.evaluate(([v]) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.visits = [v];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  }, [
    { id: "e2e-done", jobId: job.id, propertyId: job.propertyId, kind: "install", techId: db.me, assigneeIds: [db.me], start: new Date(Date.now() - 3 * 3600_000).toISOString(), durationMin: 60, step: "done", scope: [], checklist: [], photos: [], amountDueCents: 0 },
  ]);

  // the office sees the job's profit on the finished visit (so the check below means something)
  await setRole(h, "director");
  await h.go("/visit/e2e-done");
  await h.expectText(/Прибыль по работе/, "director: the finished visit shows the job's profit");

  // the technician: the same visit without profit, margin or revenue
  await setRole(h, "tech");
  await h.go("/visit/e2e-done");
  await h.expectText(/Выезд закрыт/, "tech: the finished visit is open");
  let body = await h.text();
  h.expect(!/Прибыль/.test(body), "tech: no «Прибыль» on the finished visit");
  h.expect(!/Выручка/.test(body), "tech: no revenue on the finished visit");
  await h.shot("tech-visit-done");
  // the job card hides it too
  await h.go(`/job/${job.id}`);
  body = await h.text();
  h.expect(!/Прибыль/.test(body), "tech: no «Прибыль» on the job card");

  // «＋ Создать» (first in ☰ since wave 2a): only what works, no «wave N»
  await h.go("/visits");
  await (await menuButton(p)).click();
  await p.getByRole("dialog", { name: "Меню" }).getByRole("button", { name: "Создать", exact: true }).click();
  await p.waitForTimeout(400);
  await h.expectText(/Быстрые действия/, "the «＋» sheet is open");
  body = await h.text();
  h.expect(!/Голосовая заметка/.test(body), "no «Голосовая заметка» until it works");
  h.expect(!/волн[еыа]/i.test(body), "no «Появится в волне N»");
  for (const it of ["Фото", "Новый лид", "Смета", "Расход по чеку"]) h.expect(body.includes(it), `«＋» has «${it}»`);
  await h.shot("quick");
  // «Фото» with no open visit today: a toast, not silence (failed before: nothing happened)
  await h.click("Фото");
  await h.expectText(/Сегодня открытых выездов нет/, "«Фото» without a visit says why");

  // the receipt screen no longer promises a wave
  await h.go("/expense/new");
  body = await h.text();
  h.expect(!/волн[еыа]/i.test(body), "expense: no «волна 6»");

  // «Для проверки» is there in the demo
  await setRole(h, "director");
  await h.go("/settings");
  await h.expectText(/Для проверки[\s\S]*Только в демо/, "demo: «Для проверки» with its hint");
  await h.expectText(/Сбросить|Сброс/, "demo: reset is there");
};
