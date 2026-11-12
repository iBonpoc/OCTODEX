/**
 * e2e 304 — перетаскивание в списке сметы (РС-5b, DS §14.6, спека Р5), every view; by testID, with the mouse:
 * - a row is taken by its handle «≡» and let go above the first one: it is first now; the bar stood in the list while it was held;
 * - a row let go under a section's heading goes into the section; «Вернуть» takes back only that move;
 * - let go far outside the list — it springs back, nothing moves, no toast; let go where it was taken — no toast either;
 * - «Вернуть» gives back the order that was (the whole list), a section is carried whole and «Вернуть» puts it back;
 * - the body of a folded row is taken by the mouse (a move of 5), not only the handle;
 * - a row held at the bottom edge of a long list: the page runs to the end and stops (it cannot go further), and a drop there
 *   puts the row last (#1245: the page's offset used to grow past the end and the drop turned into a spring back);
 * - the module leads its own: its line has no handle; a row let go in the module's section is refused (a toast, nothing moves).
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
  await p.locator('[data-testid^="est-sec-name-"]').locator("visible=true").first().locator("input").pressSequentially("Roof", { delay: 15 });
  await p.locator('[data-testid^="est-sec-name-"]').locator("visible=true").first().locator("input").press("Enter");
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-sec-name-"]').length === 0, null, { timeout: 3000 });
  const all = await order();
  const orderBefore = all.join(" ");
  const sec = all.find((x) => x.startsWith("s:"));
  const last = all.filter((x) => x.startsWith("l:")).pop();
  await drag(`l:${last.slice(2)}`, async () => {
    const sBox = await tid(`est-section-${sec.slice(2)}`).boundingBox();
    return sBox.y + sBox.height + 12;
  });
  await p.waitForFunction(([s, l]) => { const els = [...document.querySelectorAll('[data-testid^="est-line-"], [data-testid^="est-section-"]')].map((e) => e.getAttribute("data-testid")); return els.indexOf(`est-line-${l}`) === els.indexOf(`est-section-${s}`) + 1; }, [sec.slice(2), last.slice(2)], { timeout: 4000 });
  await line.undo(h);
  await p.waitForFunction((o) => [...document.querySelectorAll('[data-testid^="est-line-"], [data-testid^="est-section-"]')].map((e) => e.getAttribute("data-testid").replace("est-line-", "l:").replace("est-section-", "s:")).join(" ") === o, orderBefore, { timeout: 4000 });
  h.expect((await order()).join(" ") === orderBefore, "«Вернуть» gave back the whole order that was");
  await p.waitForFunction(([s, l]) => { const els = [...document.querySelectorAll('[data-testid^="est-line-"], [data-testid^="est-section-"]')].map((e) => e.getAttribute("data-testid")); return els.indexOf(`est-line-${l}`) !== els.indexOf(`est-section-${s}`) + 1; }, [sec.slice(2), last.slice(2)], { timeout: 4000 });

  // let go where it was taken: nothing moved, no toast
  const keep = (await order()).join(" ");
  const lastKey = (await order()).filter((x) => x.startsWith("l:")).pop();
  const lb = await tid(`est-line-${lastKey.slice(2)}`).boundingBox();
  await drag(`l:${lastKey.slice(2)}`, lb.y + lb.height / 2);
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="sort-bar"]').length === 0, null, { timeout: 3000 });
  h.expect((await order()).join(" ") === keep && (await p.getByTestId("toast-undo").count()) === 0, "let go where it was taken: the same order, no toast");

  // a section is carried whole: a second section goes above the first; «Вернуть» puts it back
  await tid("est-add-section").getByRole("button").click();
  await p.locator('[data-testid^="est-sec-name-"]').locator("visible=true").first().locator("input").pressSequentially("Yard", { delay: 15 });
  await p.locator('[data-testid^="est-sec-name-"]').locator("visible=true").first().locator("input").press("Enter");
  await p.waitForFunction(() => document.querySelectorAll('[data-testid^="est-sec-name-"]').length === 0, null, { timeout: 3000 });
  const withYard = await order();
  const secs = withYard.filter((x) => x.startsWith("s:"));
  h.expect(secs.length === 2 && secs[0] === `s:${sec.slice(2)}`, `two sections, Roof first (${withYard.join(" ")})`);
  // both headings in the middle of the window (on a phone the first one sits under the page header)
  await tid(`est-section-${secs[0].slice(2)}`).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await drag(`s:${secs[1].slice(2)}`, async () => (await tid(`est-section-${secs[0].slice(2)}`).boundingBox()).y + 2);
  await p.waitForFunction((first) => document.querySelector('[data-testid^="est-section-"]')?.getAttribute("data-testid") === `est-section-${first}`, secs[1].slice(2), { timeout: 4000 });
  h.expect((await order()).filter((x) => x.startsWith("s:"))[0] === secs[1], "the dragged section is first");
  await line.undo(h);
  await p.waitForFunction((o) => [...document.querySelectorAll('[data-testid^="est-line-"], [data-testid^="est-section-"]')].map((e) => e.getAttribute("data-testid").replace("est-line-", "l:").replace("est-section-", "s:")).join(" ") === o, withYard.join(" "), { timeout: 4000 });

  // the body of a folded row is taken by the mouse (a move of 5), not only the handle
  const firstLine = (await order()).find((x) => x.startsWith("l:"));
  const body = tid(`sort-row-l:${firstLine.slice(2)}`);
  const bb = await body.boundingBox();
  await p.mouse.move(bb.x + 40, bb.y + bb.height / 2);
  await p.mouse.down();
  await p.mouse.move(bb.x + 40, bb.y + bb.height / 2 + 14, { steps: 4 });
  await p.getByTestId("sort-bar").first().waitFor({ timeout: 3000 });
  await p.mouse.up();
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="sort-bar"]').length === 0, null, { timeout: 3000 });

  // a long list: rows held at the bottom edge — the page runs to its end and stops; the drop puts the row last
  for (let i = 1; i <= 22; i++) await line.addCustom(h, `Long ${i}`, 1);
  const ordLong = (await order()).filter((x) => x.startsWith("l:"));
  const first = ordLong[0];
  const hd = tid(`sort-handle-${first}`);
  await hd.scrollIntoViewIfNeeded();
  // the page's own scroll event reaches the app a frame or two later: take the row once the page has stood still
  await p.waitForFunction(() => new Promise((r) => { let n = 0; const f = () => (++n > 12 ? r(true) : requestAnimationFrame(f)); f(); }), null, { timeout: 5000 });
  const hb = await hd.boundingBox();
  const vh = p.viewportSize().height;
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await p.mouse.down();
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + 12, { steps: 3 });
  await p.mouse.move(hb.x + hb.width / 2, vh - 6, { steps: 8 });
  await p.getByTestId("sort-bar").first().waitFor({ timeout: 3000 });
  // the page reaches its end ...
  await p.waitForFunction(() => { let e = document.querySelector('[data-testid^="est-line-"]'); while (e && !(e.scrollTop > 0 && e.scrollHeight > e.clientHeight + 50)) e = e.parentElement; return !!e && e.scrollTop + e.clientHeight >= e.scrollHeight - 2; }, null, { timeout: 15000 });
  // ... and is held there for a while (40 frames): the row must still be with the finger
  await p.waitForFunction(() => new Promise((r) => { let n = 0; const f = () => (++n > 40 ? r(true) : requestAnimationFrame(f)); f(); }), null, { timeout: 5000 });
  // the row is still under the finger (the page's offset used to grow past the end: the row ran away from the finger)
  const held = await tid(`sort-row-${first}`).boundingBox();
  h.expect(Math.abs(held.y + held.height / 2 - (vh - 6)) < 120, `held at the end of the page: the row stays with the finger (row at ${Math.round(held.y + held.height / 2)}, finger at ${vh - 6})`);
  // the last row may be out of sight (a phone: the totals take the end of the page): the finger goes into the top zone and the page
  // scrolls back until the last row is well in view
  const x = hb.x + hb.width / 2;
  const lastId = ordLong[ordLong.length - 1].slice(2);
  // (a phone has a bottom bar: its edge zone is higher, keep the row clear of it)
  const below = p.viewportSize().width < 600 ? 300 : 100;
  const inView = ([k, below]) => { const e = document.querySelector(`[data-testid="sort-row-l:${k}"]`); if (!e) return false; const r = e.getBoundingClientRect(); const c = r.top + r.height / 2; return c > 250 && c < window.innerHeight - below; };
  if (!(await p.evaluate(inView, [lastId, below]))) {
    await p.mouse.move(x, 24, { steps: 10 });
    await p.waitForFunction(inView, [lastId, below], { timeout: 15000 });
  }
  // out of the edge zone, the page stops; once the last row has stood still for 20 frames, the finger goes just below it
  await p.mouse.move(x, Math.round(vh / 2), { steps: 6 });
  await p.waitForFunction((k) => new Promise((r) => { const e = document.querySelector(`[data-testid="est-line-${k}"]`); let prev = -1; let still = 0; const f = () => { const t = e.getBoundingClientRect().top; still = Math.abs(t - prev) < 0.5 ? still + 1 : 0; prev = t; still >= 20 ? r(true) : requestAnimationFrame(f); }; f(); }), lastId, { timeout: 8000 });
  // (the list's rows are the `sort-row` boxes: a row's own box is smaller than the place it takes)
  const lastBox = await tid(`sort-row-l:${lastId}`).boundingBox();
  // (the rows below the old place stand one row higher while a row is held: the place is counted from where they were)
  await p.mouse.move(x, lastBox.y + lastBox.height + 50, { steps: 3 });
  await p.mouse.up();
  await p.waitForFunction((k) => { const ids = [...document.querySelectorAll('[data-testid^="est-line-"]')].map((e) => e.getAttribute("data-testid")); return ids[ids.length - 1] === `est-line-${k}`; }, first.slice(2), { timeout: 5000 });

  // the module leads its own: its line has no handle; a drop into its section is refused with a toast
  await tid("ue-save").getByRole("button").click();
  await p.waitForFunction(() => (JSON.parse(localStorage.getItem("octo.db.v5") || "null")?.db?.estimates ?? []).some((e) => e.customerId === "c2" && e.doc?.options?.[0]?.lines?.length >= 25), null, { timeout: 8000 });
  const est = (await h.db()).estimates.find((e) => e.customerId === "c2" && e.doc?.options?.[0]?.lines?.length >= 25);
  const raw2 = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), "octo.db.v5");
  const o0 = raw2.db.estimates.find((e) => e.id === est.id).doc.options[0];
  o0.sections = [{ id: "MOD", kind: "module", module: "gutters", title: "Gutters" }];
  o0.lines[0] = { ...o0.lines[0], sectionId: "MOD", source: { module: "gutters", key: "run" } };
  await h.seed("octo.db.v5", raw2);
  await h.go(`/estimate/new?id=${est.id}`);
  await tid("est-add-new").waitFor({ timeout: 8000 });
  const modLine = o0.lines[0].id;
  h.expect((await p.getByTestId(`sort-handle-l:${modLine}`).count()) === 0, "the module's line has no handle");
  const other = o0.lines[1].id;
  const before2 = (await order()).join(" ");
  await drag(`l:${other}`, async () => { const m = await tid("est-section-MOD").boundingBox(); return m.y + m.height + 8; });
  await p.getByTestId("toast-undo").or(p.getByText(/Порядок этих позиций ведёт замер/)).first().waitFor({ timeout: 4000 });
  h.expect(/Порядок этих позиций ведёт замер/.test(await p.locator("body").innerText()), "the refusal is said");
  h.expect((await order()).join(" ") === before2, "nothing moved");
};
