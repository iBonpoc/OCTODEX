/**
 * e2e 444 — «Просмотр замера»: «Детали» и «Водостоки» как их читает человек (#1766, DS 1.16.0 §8.14). Every view.
 * - the quantity is one line in its own column (was «49′ / 9″», «1 / шт» on 390);
 * - the names are the supplier's (#1800, founder 16.11): English trade words even in the Russian app — «End Cap – Left / Right»,
 *   «Coil 11⅞″ · для заказа» (not on the client's estimate), the downspout's sticks on its own row («куски по 10′: 2»);
 *   never two equal names with equal properties in a group;
 * - no code: no «.027», «hidden», «plain», «2x3», «2"×3"», «2″ × 3″», «42» alone; the size reads «2×3» (#1916);
 * - three equal downspouts are one row of their kind «D1–D3 · 3 шт» with the total length; one storey — no «эт N»;
 * - on 820 and 1280 the list is no wider than layout.formMax (560).
 * Finds things by testID; waits on what it checks.
 */
const { skipLength, closeDsMenu, openView, pressWhenStill, canvasAt, pastDoubleTap } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await tid("module-gutters-status").filter({ hasText: /^Пробный/ }).waitFor({ timeout: 5000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const line = async (xa, ya, xb, yb) => {
    await canvasAt(p, xa, ya);
    await p.mouse.move(xa, ya);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(xa + ((xb - xa) * i) / 10, ya + ((yb - ya) * i) / 10);
    await p.mouse.up();
    await skipLength(p);
  };
  const y = b.y + b.height * 0.35, x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.75, y1 = b.y + b.height * 0.65;
  await line(x0, y, x1, y);
  await line(x1, y, x1, y1);
  // three downspouts on the first gutter, all the same
  for (const f of [0.2, 0.45, 0.7]) {
    // two taps on a tool open «Для новых водостоков» (#1563 B): the next tap waits out the double tap
    await pastDoubleTap(p);
    await tid("draw-tool-ds").getByRole("button").click();
    await canvasAt(p, x0 + (x1 - x0) * f, y);
    await p.mouse.click(x0 + (x1 - x0) * f, y);
    // the downspout's panel may come late on a loaded machine: wait for it, then close it (closeDsMenu gives up after 2 s)
    if (h.layout.width <= 390) await tid("attr-panel").first().waitFor({ timeout: 8000 });
    await closeDsMenu(p);
  }
  await tid("draw-done").waitFor({ timeout: 8000 });

  await openView(p);
  await tid("view-svg").waitFor({ timeout: 5000 });
  await pressWhenStill(tid("view-details").getByRole("button"));
  await tid("view-parts").waitFor({ timeout: 5000 });

  // the downspouts: one row for the three, with the downspout's length; one storey — no storey word
  await tid("view-ds-1").waitFor({ timeout: 5000 });
  const ds = (await tid("view-ds-1").innerText()).replace(/\s+/g, " ");
  h.expect(/D1–D3/.test(ds) && /3 шт/.test(ds), `three equal downspouts are one row «D1–D3 · 3 шт» (${ds})`);
  h.expect((await tid("view-ds-2").count()) === 0, "D2 is folded into D1–D3");
  h.expect(/\d+′/.test(await tid("view-ds-1-qty").innerText()), "the downspout's length on the right");
  h.expect(!/эт \d/.test(ds), `one storey: no «эт N» (${ds})`);
  // founder 16.11: «труба» is never said — only «водосток»
  h.expect(!/труб/i.test(await tid("view-screen").innerText()), "no «труба» on the screen");
  h.expect(/2×3(?!″)/.test(ds) && !/2x3|2"|2″\s*×/.test(ds), `the size «2×3» (${ds})`);

  // the parts: the quantity is one line, as tall as the name's line
  const card = tid("view-parts").locator("xpath=..");
  const qty = card.locator('[data-testid$="-qty"]').locator("visible=true");
  const n = await qty.count();
  h.expect(n > 5, `the parts are listed (${n})`);
  for (let i = 0; i < n; i++) {
    const q = qty.nth(i);
    const id = await q.getAttribute("data-testid");
    const qb = await q.boundingBox();
    const tb = await p.getByTestId(id.replace(/-qty$/, "-title")).locator("visible=true").boundingBox();
    h.expect(qb && tb && qb.height <= tb.height + 2, `${id}: the quantity is one line (${qb && qb.height} vs ${tb && tb.height}): ${await q.innerText()}`);
  }

  // no twin rows in a group; the end caps by side; what is only bought says so
  for (const g of ["gutter", "ds", "fix"]) {
    const grp = tid(`view-parts-${g}`);
    if (!(await grp.count())) continue;
    const rows = grp.locator('[data-testid^="view-part-"]').locator("visible=true");
    const texts = [];
    for (let i = 0; i < (await rows.count()); i++) {
      const id = await rows.nth(i).getAttribute("data-testid");
      if (/-(title|qty)$/.test(id)) continue;
      texts.push((await rows.nth(i).innerText()).split("\n").slice(0, -1).join(" ").replace(/\s+/g, " ").trim());
    }
    h.expect(new Set(texts).size === texts.length, `${g}: no twin rows (${texts.join(" / ")})`);
  }
  const all = (await card.innerText()).replace(/\s+/g, " ");
  h.expect(/End Cap – Left/.test(all) && /End Cap – Right/.test(all), "the end caps by side");
  // DS §8.14: «для заказа» — exactly the parts that are not in the client's estimate (the coil, rivets, screws, paint);
  // a part both priced and bought (a hanger, a strap, sealant) has no mark
  h.expect(/Coil [^·]*·[^]*?для заказа/.test(all), "the coil says «для заказа»");
  const marked = (await card.innerText()).split("\n").filter((l) => /для заказа/.test(l)).length;
  h.expect(marked >= 3, `«для заказа» on the supplier-only parts (${marked})`);
  h.expect(/куски по 10′: \d/.test(all), "the downspout's sticks are said on its row");
  // #1800: a part's name is the supplier's — no Russian word in a name
  const titles = card.locator('[data-testid$="-title"]').locator("visible=true");
  for (let i = 0; i < (await titles.count()); i++) {
    const tt = await titles.nth(i).innerText();
    h.expect(!/[А-Яа-яЁё]/.test(tt), `a part's name is the supplier's English one (${tt})`);
  }
  await tid("view-parts-help").waitFor({ timeout: 5000 });
  const codes = all.match(/(^|[\s·])\.\d+|\bhidden\b|\bplain\b|\b\d+x\d+\b|\d"|· 42( |$)/g);
  h.expect(!codes, `no code in the parts (${codes})`);

  // 820 and 1280: the list is no wider than the form's column
  if (h.layout.width >= 820) {
    const cb = await card.boundingBox();
    h.expect(cb.width <= 561, `the list is no wider than 560 (${cb.width})`);
  }
  await h.shot("parts");
};
