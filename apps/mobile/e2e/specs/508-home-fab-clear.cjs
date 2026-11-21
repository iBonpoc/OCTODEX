/**
 * e2e 508 — #1760 (DS §5.3): the yellow floating «＋» of «Главная» on a phone never stands on a button at rest — at the
 * end of the list (the bottom padding fab + space[3], #1262) and on a short screen (little to show). While scrolling it
 * may pass over buttons, like any floating button (the lead's decision, DS §5.3).
 * С1 ДАНО «Главная» на телефоне (директор и диспетчер); КОГДА прокрутка до конца; ТОГДА рамка «＋» не пересекает ни одну кнопку.
 * С2 ДАНО короткий экран (почти нечего показать); ТОГДА в покое рамка «＋» не пересекает ни одну кнопку.
 * A phone view only (on 820/1280 «＋» is in the header); by testID and boxes.
 */
const KEY = "octo.db.v5";
exports.run = async (h) => {
  const p = h.page;
  if (h.layout.width >= 820) {
    h.expect(true, "820/1280: «＋» is in the header — nothing floats");
    return;
  }
  /** the buttons under «＋» now (the last scroll position the caller set) */
  const under = () =>
    p.evaluate(() => {
      const f = document.querySelector('[data-testid="fab"]')?.getBoundingClientRect();
      if (!f) return null;
      return [...document.querySelectorAll('[role="button"]')]
        .filter((e) => e.getAttribute("data-testid") !== "fab" && e.offsetParent !== null)
        .map((e) => ({ r: e.getBoundingClientRect(), t: (e.getAttribute("aria-label") || e.textContent || "").slice(0, 40) }))
        .filter(({ r }) => r.width > 0 && r.right > f.left && r.left < f.right && r.bottom > f.top && r.top < f.bottom)
        .map((x) => x.t);
    });
  const toEnd = () =>
    p.evaluate(async () => {
      const el = [...document.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== "visible").sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      if (el) el.scrollTop = el.scrollHeight;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });

  // С1: the end of the list, the director and the office
  for (const role of ["director", "dispatcher"]) {
    await h.seed("octo.role.v1", role);
    await h.go("/today");
    await p.getByTestId("fab").locator("visible=true").first().waitFor({ timeout: 8000 });
    await toEnd();
    const hit = await under();
    h.expect(hit !== null && hit.length === 0, `С1 ${role}: at the end «＋» stands on no button (${JSON.stringify(hit)})`);
  }
  await h.shot("end");

  // С2: a short screen — one reason with a button, little else
  await h.go("/today");
  await p.waitForFunction((k) => !!JSON.parse(localStorage.getItem(k) || "null")?.db?.leads, KEY, { timeout: 8000 });
  const raw = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
  const lead = raw.db.leads.find((l) => l.status === "new") ?? raw.db.leads[0];
  Object.assign(raw.db, { leads: [lead], estimates: [], invoices: [], jobs: [], visits: [], tasks: [], payments: [] });
  await h.seed(KEY, raw);
  await h.seed("octo.role.v1", "dispatcher");
  await h.go("/today");
  await p.getByTestId("fab").locator("visible=true").first().waitFor({ timeout: 8000 });
  const hit2 = await under();
  h.expect(hit2 !== null && hit2.length === 0, `С2 a short screen at rest: «＋» stands on no button (${JSON.stringify(hit2)})`);
  await toEnd();
  const hit3 = await under();
  h.expect(hit3 !== null && hit3.length === 0, `С2 a short screen at its end: «＋» stands on no button (${JSON.stringify(hit3)})`);
  await h.shot("short");
};
