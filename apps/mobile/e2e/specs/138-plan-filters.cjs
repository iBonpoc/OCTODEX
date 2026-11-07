const { atMinute, todayKey } = require("../companyTime.cjs");
const { listSearch, listSearchClear } = require("../listSearch.cjs");
const { planMaster, planMasterChosen, planShowDone } = require("../planFilters.cjs");
/**
 * The filters of «План» by the one rule (docs/specs/31-list-filters.md, director 07.11), every view (3 widths × 2 themes):
 * - one row: the magnifier and «Фильтры» (1280: a button per group); no pill «Мастер: Все ▾», no «Все / Я / Ivan» chips;
 * - the magnifier finds a visit by its client, address or work, a task by its title; ✕ brings the whole plan back;
 * - «Мастер» is the first group of the sheet, one at a time: the one picked is a chip «Мастер: Ivan Sokolov ✕» under the row,
 *   ✕ shows everyone again; a long «Мастер» (more than 10) has a search of its own;
 * - «Выполненные» is in the sheet in the Feed, not in the Day.
 * Our own visit and task today at noon — no reliance on the demo's hours.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (loc) => loc.locator("visible=true");
  await h.go("/today");
  const today = todayKey();
  const names = await p.evaluate(({ noon, half }) => {
    const raw = JSON.parse(localStorage.getItem("octo.db.v5"));
    const prop = raw.db.properties[0];
    raw.db.visits = [...raw.db.visits, { id: "v138", propertyId: prop.id, kind: "inspection", techId: "m-ivan", assigneeIds: ["m-ivan"], start: noon, durationMin: 30, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0 }];
    raw.db.tasks = [...(raw.db.tasks || []), { id: "t138", subjectType: "job", subjectId: raw.db.jobs[0].id, title: "T138 order the downspouts", startsAt: half, endsAt: half, assigneeId: raw.db.me }];
    // a long team: more than 10 techs, so «Мастер» gets a search of its own
    const extra = Array.from({ length: 11 }, (_, i) => ({ id: `m138-${i}`, name: `Tech138 ${String.fromCharCode(65 + i)}`, initials: "T", kind: "employee", roles: ["tech"] }));
    raw.db.members = [...raw.db.members.filter((m) => !String(m.id).startsWith("m138-")), ...extra];
    localStorage.setItem("octo.db.v5", JSON.stringify(raw));
    localStorage.setItem("octo.planMode.v1", JSON.stringify("feed"));
    localStorage.setItem("octo.planWho.v1", JSON.stringify("all"));
    return { client: raw.db.customers.find((c) => c.id === prop.customerId)?.name ?? "", address: prop.address };
  }, { noon: atMinute(today, 12 * 60), half: atMinute(today, 12 * 60 + 30) });
  await h.go("/plan");
  const bar = vis(p.getByTestId("filter-bar")).first();
  await bar.waitFor();
  const got = vis(p.getByRole("button", { name: "Понятно", exact: true }));
  if (await got.count()) { await got.first().click(); await p.waitForTimeout(300); }

  // one row; the old switches are gone
  const toggle = vis(bar.getByTestId("filter-search-toggle")).first();
  const open = h.layout.width === 1280 ? vis(bar.getByTestId("filter-group-people")).first() : vis(bar.getByTestId("filter-button")).first();
  const [tb, ob] = [await toggle.boundingBox(), await open.boundingBox()];
  h.expect(tb && ob && Math.abs(tb.y + tb.height / 2 - (ob.y + ob.height / 2)) <= 8, `the magnifier and «Фильтры» in one row (${JSON.stringify(tb)} / ${JSON.stringify(ob)})`);
  h.expect((await vis(p.getByTestId(/^filter-pill-/)).count()) === 0, "no pill «Мастер: Все ▾»");
  h.expect((await vis(p.getByRole("radio", { name: "Все", exact: true })).count()) === 0, "no «Все / Я / Ivan» chips over the plan");
  await h.expectText(/T138 order the downspouts/, "the task is in the Feed");
  await h.shot("plan-filters");

  // the magnifier: a visit by its address, a task by its title; nothing found → nothing; ✕ → everything
  const short = names.address.split(" ").slice(0, 2).join(" ");
  await listSearch(p, short);
  h.expect(!(await h.text()).includes("T138 order the downspouts"), `the address «${short}» leaves the task out`);
  h.expect((await h.text()).includes(names.client), `… and keeps the visit at it (${names.client})`);
  await listSearch(p, "downspouts");
  await h.expectText(/T138 order the downspouts/, "a task by its title");
  await listSearch(p, "zzzqqq");
  h.expect(!(await h.text()).includes("T138 order the downspouts") && !(await h.text()).includes(names.client), "nothing found → nothing");
  await h.shot("plan-search-on");
  await listSearchClear(p);
  await h.expectText(/T138 order the downspouts/, "✕ — the whole plan again");

  // «Мастер»: the first group of the sheet; a long one has a search; the picked one is a chip under the row
  await open.click(); await p.waitForTimeout(400);
  const sheet = h.sheet();
  if (h.layout.width !== 1280) {
    const heads = await sheet.locator('[dir="auto"]').allInnerTexts();
    const iM = heads.indexOf("Мастер");
    const iD = heads.indexOf("Показывать");
    h.expect(iM >= 0 && iD > iM, `«Мастер» is the first group, «Показывать» after it (${heads.slice(0, 6).join(" | ")})`);
  }
  const find = vis(sheet.getByTestId("filter-find-people"));
  h.expect((await find.count()) === 1, "more than 10 people: a search over them");
  await find.first().locator("input").fill("Tech138 C"); await p.waitForTimeout(300);
  h.expect((await sheet.getByRole("radio").count()) === 1, "the search leaves one person");
  await h.shot("plan-master-search");
  await sheet.getByText("Готово", { exact: true }).click(); await p.waitForTimeout(400);

  await planMaster(p, "Ivan");
  h.expect((await planMasterChosen(p)) === "Мастер: Ivan Sokolov", "the chip «Мастер: Ivan Sokolov ✕»");
  h.expect((await vis(p.getByRole("button", { name: "Убрать фильтр: Мастер: Ivan Sokolov" })).count()) === 1, "… which the screen reader hears as a filter to take off");
  if (h.layout.width !== 1280) h.expect((await vis(p.getByRole("button", { name: "Фильтры, включено: 1" })).count()) === 1, "«Фильтры» says one is on");
  h.expect(!(await h.text()).includes("T138 order the downspouts"), "Ivan's plan: the owner's own task is not in it");
  await h.shot("plan-master-chosen");
  await planMaster(p, null);
  h.expect((await planMasterChosen(p)) === null, "✕ — the chip is gone");
  await h.expectText(/T138 order the downspouts/, "… and everyone's plan is back");

  // «Выполненные»: in the Feed's sheet; on — a chip; the Day has no such group
  await planShowDone(p, true);
  h.expect((await vis(p.getByRole("button", { name: "Убрать фильтр: Выполненные" })).count()) === 1, "«Выполненные ✕» under the row");
  await planShowDone(p, false);
  await h.clickText("День"); await p.waitForTimeout(400);
  h.expect((await vis(p.getByTestId("filter-group-done")).count()) === 0, "the Day: no «Выполненные» group button");
  if (h.layout.width !== 1280) {
    await vis(p.getByTestId("filter-button")).first().click(); await p.waitForTimeout(400);
    h.expect((await h.sheet().getByRole("checkbox", { name: /^Выполненные/ }).count()) === 0, "the Day: no «Выполненные» in the sheet");
    await h.sheet().getByText("Готово", { exact: true }).click(); await p.waitForTimeout(300);
  }
  await h.clickText("Лента"); await p.waitForTimeout(300);
};
