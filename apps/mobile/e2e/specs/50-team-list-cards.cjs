/**
 * «Команда» on the new list cards (step 10а, PR9b; docs/specs/06-list-cards.md §5), every view (3 widths × 2 themes).
 * - one card per person: name, roles and «Субподрядчик» / «Вы» as grey tags, phone, call / SMS (not on my own card);
 * - a tech: «Выездов сегодня: N» and the current visit's own status in words, read only (as in «Бригады сейчас»);
 * - «Приглашён» is a neutral status (was a yellow chip), no coloured edge on any card;
 * - the director opens «Сотрудник» on an employee; a subcontractor's card does not open; no «…»; edges aligned;
 * - the technician cannot open «Команда» (route guard): he lands on his visits, no team cards, no «Пригласить».
 */
const { checkCardAlignment } = require("../cardsAlignment.cjs");

exports.run = async (h) => {
  const p = h.page;
  await h.go("/team");
  const db0 = await h.db();
  const today = new Date().toDateString();
  const assigned = (v, id) => (v.assigneeIds?.length ? v.assigneeIds : v.techId ? [v.techId] : []).includes(id);
  const tech = db0.members.find((m) => m.id !== db0.me && m.kind === "employee" && m.roles.includes("tech") && db0.visits.some((v) => new Date(v.start).toDateString() === today && assigned(v, m.id)));
  h.expect(tech, "demo has a tech (not me) with a visit today");
  const visit = db0.visits.filter((v) => new Date(v.start).toDateString() === today && assigned(v, tech.id)).sort((a, b) => a.start.localeCompare(b.start))[0];
  // test data: the tech's phone, his first visit in work, one invited person
  await p.evaluate(({ techId, visitId }) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.members = raw.db.members.map((m) => (m.id === techId ? { ...m, phone: "(818) 555-0199" } : m));
    raw.db.members.push({ id: "m-inv-e2e", name: "Nina Invited", initials: "NI", kind: "employee", roles: ["dispatcher"], email: "nina@example.com", pending: true });
    raw.db.visits = raw.db.visits.map((v) => (v.id === visitId ? { ...v, step: "working", closed: false } : v));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.role.v1", JSON.stringify("director"));
  }, { techId: tech.id, visitId: visit.id });
  await h.go("/team");
  const db = await h.db();
  const cards = p.locator('[data-testid="list-card"]');
  h.expect((await cards.count()) === db.members.length, `one card per person (${await cards.count()} vs ${db.members.length})`);
  const cardOf = (name) => cards.filter({ hasText: name }).first();
  // the status edge: an absolute strip on the card's left side, a few px wide, full height
  const hasEdge = (loc) => loc.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return [...e.querySelectorAll("div")].some((d) => {
      const b = d.getBoundingClientRect(), st = getComputedStyle(d);
      return st.position === "absolute" && Math.abs(b.left - r.left) <= 1 && b.width > 0 && b.width <= 6 && b.height >= r.height - 2;
    });
  });

  // a tech: «today» and the visit's own status, phone, call / SMS
  const tc = cardOf(tech.name);
  await tc.scrollIntoViewIfNeeded();
  const tt = await tc.innerText();
  const n = db.visits.filter((v) => new Date(v.start).toDateString() === today && assigned(v, tech.id)).length;
  for (const s of [tech.name, "Мастер", `Выездов сегодня: ${n}`, "Идёт работа", "(818) 555-0199"]) h.expect(tt.includes(s), `tech card shows «${s}»: ${tt.slice(0, 240)}`);
  h.expect((await tc.getByRole("button", { name: /Позвонить/ }).count()) > 0 && (await tc.getByRole("button", { name: /SMS/ }).count()) > 0, "call and SMS on the tech card");

  // me: roles and «Вы» as tags, no call to myself
  const me = db.members.find((m) => m.id === db.me);
  const mc = cardOf(me.name);
  const mt = await mc.innerText();
  h.expect(mt.includes("Вы") && mt.includes("Директор"), `my card: «Вы» and my roles: ${mt.slice(0, 200)}`);
  h.expect((await mc.getByRole("button", { name: /Позвонить/ }).count()) === 0, "no call button on my own card");

  // invited: neutral status, email, no «today»
  const ic = cardOf("Nina Invited");
  const it = await ic.innerText();
  h.expect(it.includes("Приглашён") && it.includes("nina@example.com") && it.includes("Диспетчер") && !it.includes("Выездов сегодня"), `invited card: ${it.slice(0, 200)}`);

  // a subcontractor: dashed initials, the tag
  const sub = db.members.find((m) => m.kind === "sub");
  if (sub) h.expect((await cardOf(sub.name).innerText()).includes("Субподрядчик"), "«Субподрядчик» tag");

  // nothing on the team needs action: no coloured edge on any card
  for (let i = 0; i < (await cards.count()); i++) h.expect(!(await hasEdge(cards.nth(i))), `no coloured edge (card ${i})`);
  h.expect(!/…|\.\.\./.test(await p.locator("body").innerText()), "no «…»");
  await p.evaluate(() => window.scrollTo(0, 0));
  await checkCardAlignment(h, { reference: (pg) => pg.locator('[data-testid="list-card"]').first(), min: 2 });
  await h.shot("team");

  // the director opens «Сотрудник» on an employee
  await tc.click();
  await p.waitForTimeout(500);
  await h.expectText(new RegExp(`Сотрудник: ${tech.name}`), "«Сотрудник» sheet opens");
  await h.go("/team");
  if (sub) {
    await cardOf(sub.name).click();
    await p.waitForTimeout(400);
    h.expect(!new RegExp(`Сотрудник: ${sub.name}`).test(await h.text()), "a subcontractor's card does not open «Сотрудник»");
  }

  // the technician: «Команда» is the director's screen (route guard, #132) — he lands on his visits, no team, no invite
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await h.go("/team");
  await p.waitForTimeout(500);
  h.expect(new URL(p.url()).pathname === "/visits", `tech /team → /visits (got ${p.url()})`);
  const techBody = await p.locator("body").innerText();
  h.expect(!techBody.includes("Nina Invited") && !techBody.includes("Приглашён"), "the tech sees no team cards");
  h.expect((await p.getByRole("button", { name: "Пригласить", exact: true }).count()) === 0, "the tech cannot invite");
};
