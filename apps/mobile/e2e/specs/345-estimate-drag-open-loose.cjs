/**
 * e2e 345 — dragging, two more cases of part «б» (#1307, DS §8.3, §14.6; code review), every view, by testID, with the mouse:
 * - an OPEN line taken by its own «≡» in the header: it folds with the list and is carried — the finger is not lost (the handle
 *   stays in its place); let go above the first line — it stands first;
 * - a list whose every line is in a section: while a line is carried, «Без раздела» shows as a place; a line let go under it leaves
 *   its section (it stands after «Без раздела» then).
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const ids = async () => (await p.locator('[data-testid^="est-line-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")))).map((x) => x.replace("est-line-", ""));
  const order = () => p.locator('[data-testid^="est-line-"], [data-testid="est-sec-loose"]').evaluateAll((els) => els.map((e) => (e.getAttribute("data-testid") === "est-sec-loose" ? "u" : e.getAttribute("data-testid").replace("est-line-", ""))));
  const take = async (key) => {
    const hd = tid(`sort-handle-${key}`);
    await line.toMiddle(h, hd);
    const b = await hd.boundingBox();
    const x = b.x + b.width / 2;
    await p.mouse.move(x, b.y + b.height / 2);
    await p.mouse.down();
    await p.mouse.move(x, b.y + b.height / 2 - 12, { steps: 4 });
    await p.getByTestId("sort-folded").first().waitFor({ state: "attached", timeout: 3000 });
    return { x, y: b.y + b.height / 2 - 12 };
  };
  const listTop = () => p.getByTestId("sort-folded").first().evaluate((el) => el.parentElement.getBoundingClientRect());

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  for (const [n, v] of [["Alpha (тестовые)", 10], ["Bravo (тестовые)", 20], ["Charlie (тестовые)", 30]]) await line.addCustom(h, n, v);
  const [a, , c] = await ids();

  // the open line C, taken by the «≡» in its header
  await tid(`est-line-${c}`).click();
  await tid(`est-collapse-${c}`).waitFor({ timeout: 3000 });
  const t1 = await take(`l:${c}`);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-collapse-"]').length === 0, null, { timeout: 3000 });
  const box = await listTop();
  await line.carry(h, `l:${c}`, t1.x, t1.y, box.top + 8);
  await p.mouse.up();
  await p.waitForFunction((k) => document.querySelector('[data-testid^="est-line-"]')?.getAttribute("data-testid") === `est-line-${k}`, c, { timeout: 4000 });
  h.expect((await ids())[0] === c && (await ids())[1] === a, "the open line taken by its header «≡» is first now");
  await h.shot("open-moved");

  // every line in a section: save, put them into «Roof», open again
  await tid("ue-save").getByRole("button").click();
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).some((e) => e.customerId === "c2" && e.doc?.options?.[0]?.lines?.length === 3), null, { timeout: 8000 });
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const est = raw.db.estimates.find((e) => e.customerId === "c2" && e.doc?.options?.[0]?.lines?.length === 3);
  const o0 = est.doc.options[0];
  o0.sections = [{ id: "S1", title: "Roof" }];
  o0.lines = o0.lines.map((l) => ({ ...l, sectionId: "S1" }));
  await h.seed("octo.db.v5", raw);
  await h.go(`/estimate/new?id=${est.id}`);
  await tid("est-add-new").waitFor({ timeout: 8000 });
  h.expect((await p.getByTestId("est-sec-loose").count()) === 0, "no «Без раздела» while nothing is carried");
  const [first] = await ids();
  // the list in the middle of the screen: its end is not in the edge zone above the bottom panel (there the page would scroll)
  await tid("est-add-new").evaluate((el) => el.scrollIntoView({ block: "center" }));
  const t2 = await take(`l:${first}`);
  // «Без раздела» is a place while a line is carried
  await tid("est-sec-loose").waitFor({ timeout: 3000 });
  const loose = await tid("est-sec-loose").boundingBox();
  // just below the middle of «Без раздела» (the place after it), not near the screen's edge: there the page would scroll
  await line.carry(h, `l:${first}`, t2.x, t2.y, loose.y + loose.height / 2 + 12);
  await p.getByTestId("sort-bar").first().waitFor({ timeout: 3000 });
  await h.shot("loose-target");
  await p.mouse.up();
  await p.waitForFunction((k) => {
    const o = [...document.querySelectorAll('[data-testid^="est-line-"], [data-testid="est-sec-loose"]')].map((e) => e.getAttribute("data-testid"));
    return o.indexOf("est-sec-loose") >= 0 && o.indexOf(`est-line-${k}`) > o.indexOf("est-sec-loose");
  }, first, { timeout: 4000 });
  h.expect(true, `the line left its section: ${(await order()).join(" ")}`);
};
