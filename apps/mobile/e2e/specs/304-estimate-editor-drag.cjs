/**
 * e2e 304 — перетаскивание в списке сметы (РС-5b, DS §14.6, спека Р5), every view; by testID, with the mouse:
 * - a row is taken by its handle «≡» and let go above the first one: it is first now; the bar stood in the list while it was held;
 * - a row let go under a section's heading goes into the section; «Вернуть» takes back only that move;
 * - let go far outside the list — it springs back, nothing moves, no toast.
 */
exports.run = async (h) => {
  const p = h.page;
  const line = require("../estimateLine.cjs");
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const order = () => p.locator('[data-testid^="est-line-"], [data-testid^="est-section-"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").replace("est-line-", "l:").replace("est-section-", "s:")));
  // `target`: a number, or a function that reads the place on the screen AFTER the row is taken (the page may have moved)
  const drag = async (key, target, { release = true } = {}) => {
    const hd = tid(`sort-handle-${key}`);
    await hd.scrollIntoViewIfNeeded();
    const b = await hd.boundingBox();
    const x = b.x + b.width / 2;
    await p.mouse.move(x, b.y + b.height / 2);
    await p.mouse.down();
    const first = typeof target === "function" ? b.y - 30 : target;
    await p.mouse.move(x, b.y + b.height / 2 + (first > b.y ? 12 : -12), { steps: 4 });
    const toY = typeof target === "function" ? await target() : target;
    await p.mouse.move(x, toY, { steps: 12 });
    if (release) {
      await p.getByTestId("sort-bar").first().waitFor({ timeout: 3000 });
      await p.mouse.up();
    }
  };
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await tid("est-add-new").waitFor({ timeout: 8000 });
  await line.addCustom(h, "Alpha", 10);
  await line.addCustom(h, "Bravo", 20);
  await line.addCustom(h, "Charlie", 30);
  const ids = (await order()).filter((x) => x.startsWith("l:"));
  h.expect(ids.length === 3, "three rows");
  const [a, , c] = ids;

  // C above A
  const aBox = await tid(`est-line-${a.slice(2)}`).boundingBox();
  await drag(`l:${c.slice(2)}`, aBox.y + 2);
  await p.waitForFunction((first) => document.querySelector('[data-testid^="est-line-"]')?.getAttribute("data-testid") === `est-line-${first}`, c.slice(2), { timeout: 4000 });
  h.expect((await order())[0] === c, `the dragged row is first (${(await order()).join(" ")})`);
  h.expect((await p.getByTestId("sort-bar").count()) === 0, "the bar is gone after the drop");

  // far outside the list: it springs back
  const before = (await order()).join(" ");
  await drag(`l:${c.slice(2)}`, 5, { release: false });
  await p.mouse.move(5, 4, { steps: 4 });
  await p.mouse.up();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="sort-bar"]').length === 0, null, { timeout: 3000 });
  h.expect((await order()).join(" ") === before, "let go over nothing: nothing moved");

  // into a section: «＋ Раздел», then the last row under its heading
  await tid("est-add-section").getByRole("button").click();
  await p.locator('[data-testid^="est-sec-name-"]').locator("visible=true").first().locator("input").fill("Roof");
  await p.locator('[data-testid^="est-sec-name-"]').locator("visible=true").first().locator("input").press("Enter");
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-sec-name-"]').length === 0, null, { timeout: 3000 });
  const all = await order();
  const sec = all.find((x) => x.startsWith("s:"));
  const last = all.filter((x) => x.startsWith("l:")).pop();
  await drag(`l:${last.slice(2)}`, async () => {
    const sBox = await tid(`est-section-${sec.slice(2)}`).boundingBox();
    return sBox.y + sBox.height + 12;
  });
  await p.waitForFunction(([s, l]) => { const els = [...document.querySelectorAll('[data-testid^="est-line-"], [data-testid^="est-section-"]')].map((e) => e.getAttribute("data-testid")); return els.indexOf(`est-line-${l}`) === els.indexOf(`est-section-${s}`) + 1; }, [sec.slice(2), last.slice(2)], { timeout: 4000 });
  await line.undo(h);
  await p.waitForFunction(([s, l]) => { const els = [...document.querySelectorAll('[data-testid^="est-line-"], [data-testid^="est-section-"]')].map((e) => e.getAttribute("data-testid")); return els.indexOf(`est-line-${l}`) !== els.indexOf(`est-section-${s}`) + 1; }, [sec.slice(2), last.slice(2)], { timeout: 4000 });
};
