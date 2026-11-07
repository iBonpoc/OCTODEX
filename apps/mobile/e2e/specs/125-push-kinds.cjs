/**
 * Пуши P4c (docs/specs/27-push.md §4.11), every view: «Мои настройки» → «Уведомления» → «Что присылать».
 * - the director sees five groups; on by default, «Клиент открыл смету» off (as the server, app.push_enabled);
 * - a switch changes at once and is still so after a reload (the person's setting, kept by the store; on the web too);
 * - «Лиды» says it covers the reminders too;
 * - the technician sees only «Выезды» and «Лиды» (his switch of «Лиды» is the same one), a subcontractor — no group;
 * - the screen keeps one yellow (rule 2: the switches are a state, not an action — e2e/accent.cjs).
 * The op to the server (set_push_kind through the queue) is test/pushPrefs.test.ts; who gets what — db T84, T85, T88.
 */
const { expectOneAccent } = require("../accent.cjs");

const ALL = ["signed", "payment", "visits", "leads", "viewed"];

exports.run = async (h) => {
  const p = h.page;
  const kinds = () => p.getByTestId("push-kinds").locator("visible=true");
  const row = (g) => p.getByTestId(`push-kind-${g}`).locator("visible=true").first();
  const sw = (g) => row(g).getByRole("switch");
  const checked = async (g) => (await sw(g).getAttribute("aria-checked")) === "true";
  const shown = async () => {
    const out = [];
    for (const g of ALL) if ((await p.getByTestId(`push-kind-${g}`).locator("visible=true").count()) > 0) out.push(g);
    return out;
  };
  const open = async () => {
    await h.go("/settings");
    await kinds().first().waitFor({ timeout: 8000 });
    await kinds().first().scrollIntoViewIfNeeded();
  };

  // the director: five groups, the defaults
  await open();
  h.expect(JSON.stringify(await shown()) === JSON.stringify(ALL), `the director sees all five groups (${await shown()})`);
  for (const g of ["signed", "payment", "visits", "leads"]) h.expect(await checked(g), `«${g}» is on by default`);
  h.expect(!(await checked("viewed")), "«Клиент открыл смету» is off by default");
  h.expect(/напоминания/.test(await row("leads").innerText()), "«Лиды» says the reminders are in it");
  const text = await h.text();
  h.expect(/Что присылать/.test(text) && text.indexOf("Что присылать") < text.indexOf("О приложении"), "«Что присылать» is in «Уведомления», before «О приложении»");
  await expectOneAccent(h, "settings with the push groups");
  await h.shot("director");

  // switch «Лиды» off and «Клиент открыл смету» on: at once, and still so after a reload
  await sw("leads").click();
  await sw("viewed").click();
  await p.waitForFunction(() => {
    const el = (id) => [...document.querySelectorAll(`[data-testid="push-kind-${id}"] [role="switch"]`)].pop();
    return el("leads")?.getAttribute("aria-checked") === "false" && el("viewed")?.getAttribute("aria-checked") === "true";
  }, null, { timeout: 5000 });
  await p.waitForTimeout(600); // the store writes the device copy after a change
  await open();
  h.expect(!(await checked("leads")) && (await checked("viewed")), "the switches are kept after a reload");
  const saved = (await h.db())?.pushPrefs ?? {};
  h.expect(saved.leads === false && saved.viewed === true, `the store keeps them (${JSON.stringify(saved)})`);

  // the technician: only «Выезды» and «Лиды»; «Лиды» is the same switch (off)
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
  await open();
  h.expect(JSON.stringify(await shown()) === JSON.stringify(["visits", "leads"]), `the technician sees «Выезды» and «Лиды» only (${await shown()})`);
  h.expect(!(await checked("leads")) && (await checked("visits")), "the technician's switches are the person's");
  await h.shot("tech");

  // a subcontractor: no group at all (he gets nothing yet, §4.8)
  await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    raw.db.members = raw.db.members.map((m) => (m.id === raw.db.me ? { ...m, kind: "sub" } : m));
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
  });
  await h.go("/settings");
  await p.getByText("Уведомления", { exact: true }).locator("visible=true").first().waitFor({ timeout: 8000 });
  h.expect((await kinds().count()) === 0, "a subcontractor sees no group");
  await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
};
