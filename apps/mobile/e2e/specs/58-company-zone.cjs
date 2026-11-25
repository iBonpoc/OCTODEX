/**
 * П4b (docs/specs/03 «П4b — этап 0», п. 7): the phone is in New York, the company in Los Angeles. The browser of this
 * spec runs in America/New_York with its clock at 9:30 PM in Los Angeles (12:30 AM of the next day in New York):
 * - the tech's «Мои выезды» still shows the company's today (not empty after the phone's midnight), times on the
 *   company's clock (the demo's 8:30 AM visit reads 8:30 AM, not 11:30 AM);
 * - «План» (day): «Сегодня» is the company's day, the same visits and times;
 * - the visit form: «tomorrow» is the company's tomorrow, the 9:00 slot is saved as 9:00 AM in Los Angeles and is
 *   shown at 9:00 AM in «План» on that day.
 * Every view (3 widths × 2 themes): the spec opens its own browser context with the same width and theme.
 */
const { addDays, dayKey, minuteOf, weekday } = require("../companyTime.cjs");

const NY = "America/New_York";
/** the moment of a wall time in Los Angeles (Nov–Mar PST −8, else PDT −7; the spec avoids the night of a change) */
function laAt(k, h, m) {
  for (const off of [8, 7]) {
    const t = new Date(`${k}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-0${off}:00`);
    if (dayKey(t.getTime()) === k && minuteOf(t.getTime()) === h * 60 + m) return t;
  }
  throw new Error(`no ${h}:${m} on ${k} in LA`);
}

const { pickVisitDay, pickVisitStart } = require("../visitForm.cjs");
exports.run = async (h0, { browser, BASE, layout, installClock }) => {
  // «today» of the company: the real LA day; the fake clock is at 9:30 PM of it
  const today = dayKey(Date.now());
  const now = laAt(today, 21, 30);
  const ctx = await browser.newContext({ viewport: { width: layout.width, height: layout.width === 390 ? 844 : 900 }, locale: "en-US", timezoneId: NY, reducedMotion: "reduce" });
  await installClock(ctx, now.getTime());
  await ctx.addInitScript((o) => {
    if (localStorage.getItem("octo.lang.v1")) return;
    localStorage.setItem("octo.lang.v1", JSON.stringify("ru"));
    localStorage.setItem("octo.role.v1", JSON.stringify("director"));
    localStorage.setItem("octo.theme.v1", JSON.stringify(o.theme));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("day"));
    localStorage.setItem("octo.hints.v1", JSON.stringify(["today", "company", "clients", "estimate-builder", "inbox", "triage", "money", "jobs", "team", "catalog", "plan", "visits"]));
  }, { theme: layout.theme });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  const go = async (path) => { await p.goto(BASE + path); await p.waitForTimeout(1000); };
  const text = async () => (await p.locator("body").innerText()).split("\n").join(" ");
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db);
  const expectText = async (re, msg) => {
    let t = await text();
    for (let i = 0; i < 15 && !re.test(t); i++) { await p.waitForTimeout(200); t = await text(); }
    h0.expect(re.test(t), `${msg}: expected ${re}\n${t.slice(0, 400)}`);
  };
  try {
    await go("/today");
    h0.expect(await p.evaluate(() => new Date().getDate()) !== Number(today.slice(8)), "the phone (New York) is already on the next day");
    const d = await db();
    const mine = d.visits.filter((v) => (v.assigneeIds?.length ? v.assigneeIds : [v.techId]).includes(d.me) && dayKey(v.start) === today);
    h0.expect(mine.length > 0, "the demo owner has visits today of the company");
    const v1 = d.visits.find((v) => v.id === "v1");
    h0.expect(dayKey(v1.start) === today && minuteOf(v1.start) === 8 * 60 + 30, `the demo's visit is at 8:30 AM in LA (${v1.start})`);

    // the tech's day: the company's today, not empty after the phone's midnight; the company's clock
    await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("tech")));
    await go("/visits");
    // v2 «Мой день»: the tile «Выезды» says «Готово N из M» to a screen reader; the rest of the day by the hour «8:30 AM»
    const tile = p.getByTestId("tile-visits").locator("visible=true").first();
    await tile.waitFor({ timeout: 8000 });
    const said = (await tile.getAttribute("aria-label")) || "";
    h0.expect(new RegExp(`Готово \\d+ из ${mine.length}`).test(said), `the tech's day counts today of the company: ${said}`);
    await expectText(/8:30\s*AM/, "the visit on the company's clock");
    h0.expect(!/11:30\s*AM/.test(await text()), "not on the phone's clock");

    // «План», day: «Сегодня» is the company's day with its visits
    await p.evaluate(() => localStorage.setItem("octo.role.v1", JSON.stringify("director")));
    await go("/plan");
    const all = d.visits.filter((v) => dayKey(v.start) === today).length;
    // v2 «Календарь»: the kicker «Сб, 21 ноября · 6 выездов» is the company's day with its count; the day's list «Выезды сегодня»
    await expectText(new RegExp(`\\b${Number(today.slice(8))} \\S+ · ${all} выезд`), "the kicker of the company's day");
    // the day's list «Выезды сегодня» is the phone's; 820 / 1280 draw the board by person under the same kicker
    if (layout.width < 820) await expectText(/Выезды сегодня/, "«Сегодня» is the company's day");
    // #2363 q73: in the Plan's plate «AM» stands as two small letters in a column («8:30 A M» in the page's text)
    await expectText(/8:30\s*A\s*M/, "the visit in the Plan on the company's clock");

    // the form: the company's tomorrow (a working day), the 9:00 slot = 9:00 AM in Los Angeles
    let offset = 1;
    while (weekday(addDays(today, offset)) === 0) offset++;
    const target = addDays(today, offset);
    await go("/job/schedule?jobId=j1");
    await pickVisitDay(p, offset); // the company's day — DateField (spec 56 wave 5б)
    await p.waitForTimeout(300);
    await pickVisitStart(p, 9 * 60); // «Начало ⌄» — 9:00 AM
    await p.getByRole("button", { name: "Запланировать", exact: true }).last().click(); await p.waitForTimeout(600);
    await p.locator('[aria-modal="true"]').last().getByRole("button", { name: "Не сейчас" }).click(); await p.waitForTimeout(400);
    const after = await db();
    const added = after.visits.filter((v) => v.jobId === "j1" && !d.visits.some((x) => x.id === v.id));
    h0.expect(added.length === 1, `one new visit (${added.length})`);
    h0.expect(dayKey(added[0].start) === target && minuteOf(added[0].start) === 9 * 60, `saved at 9:00 AM in LA on ${target}: ${added[0].start}`);

    // and «План» shows it at 9:00 AM on that day
    await go("/plan");
    if (layout.width >= 820) {
      // 820 / 1280: the same strip of days over the board by person
      await p.getByTestId(`plan-strip-${target}`).locator("visible=true").first().click();
      await expectText(/9:00\s*A\s*M/, "the new visit at 9:00 AM in the Plan");
    } else {
      // v2: the day is a pill of the strip (the arrows step by a week)
      await p.getByTestId(`plan-strip-${target}`).locator("visible=true").first().click();
      await p.waitForTimeout(400);
      // v2 TimeSlot: the hour column «9:00» and the plate «9:00 ▸ 12:00 PM» (AM said once, on the end of the same half)
      const row = p.getByTestId(`plan-row-${added[0].id}`).locator("visible=true").first();
      await row.waitFor({ timeout: 5000 });
      const rowSaid = (await row.innerText()).replace(/\s+/g, " ");
      // #2363 q73: the plate's AM/PM is two small letters in a column — «9:00 A M» in the page's text
      h0.expect(/^9:00\b/.test(rowSaid) && /\b(A\s?M|P\s?M)\b/.test(rowSaid), `the new visit at 9:00 AM in the Plan: ${rowSaid}`);
    }
    h0.expect(!errors.length, errors.join("\n"));
  } finally {
    await ctx.close();
  }
};
