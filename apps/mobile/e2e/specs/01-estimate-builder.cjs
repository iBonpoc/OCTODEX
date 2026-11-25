/** Custom line + catalog line + kit, tax 9.5% on the whole amount (a new estimate, РС-3) → totals match a hand calculation. */
exports.run = async (h) => {
  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  const line = require("../estimateLine.cjs");
  await line.addCustom(h, "Вывезти мусор", "150");
  await line.addCatalog(h, "carpet", "Carpet removal", "120");
  await line.fold(h);
  // a kit comes as several folded rows
  await line.addCatalog(h, "railing kit", /Stair railing kit/);
  // #2471: the page went on while the catalog sheet was going out (here: down to the tax row, as the next step does) — it stays
  // there and the bar stands still once the sheet has gone. The web Modal gave the focus back to «Каталог» by a plain focus() as
  // it unmounted: the page jumped up to the button (539 → 0) and «Итого» unfolded under the click (CI: 30 s «stable»)
  const pageY = () => h.page.evaluate(() => {
    let e = document.querySelector('[data-testid^="est-line-"]');
    while (e && !(e.scrollHeight > e.clientHeight + 50)) e = e.parentElement;
    return e ? Math.round(e.scrollTop) : 0;
  });
  await h.page.evaluate(() => [...document.querySelectorAll('[data-testid="est-tax-row"]')].find((e) => e.offsetParent !== null)?.scrollIntoView({ block: "center" }));
  const y0 = await pageY();
  await h.page.waitForFunction(() => document.querySelectorAll('[aria-modal="true"]').length === 0, null, { timeout: 5000 });
  // 30 frames after the sheet has gone: the same place of the page, the same frame of the bar (the capsule or the card)
  const still = await h.page.evaluate(() => new Promise((res) => {
    const box = () => { const b = document.querySelector('[data-testid="ue-save-capsule"], [data-testid="ue-save-bar"]'); const r = b && b.getBoundingClientRect(); return r ? `${b.getAttribute("data-testid")} ${r.x},${r.y},${r.width},${r.height}` : "none"; };
    const seen = new Set(); let n = 0;
    const f = () => { seen.add(box()); if (++n < 30) requestAnimationFrame(f); else res([...seen]); };
    requestAnimationFrame(f);
  }));
  const y1 = await pageY();
  h.expect(Math.abs(y1 - y0) <= 1, `the page stays put as the catalog sheet goes (${y0} → ${y1})`);
  h.expect(still.length === 1, `the bar stands still 30 frames after the sheet: ${still.join(" | ")}`);
  // DS §8.7а (#2454): the tax is set right in its row — «%» and the rate
  await require("../estimateTotals.cjs").setTax(h, "9.5");
  // 150 + 120×1.50 + 250 + 12×12.13 = 725.56; a new estimate taxes the whole amount (the founder 12.11, РС-3):
  // 9.5% of 725.56 = 68.93 → 794.49; deposit 10% = 79.45
  await h.expectText(/Сумма \| \$725\.56/, "subtotal");
  h.expect((await require("../estimateTotals.cjs").sumOf(h, "est-tax-row")) === "$68.93", "tax on the whole amount");
  h.expect(!/9\.5% · /.test(await h.text()), "no kinds listed after the rate (the tax is on the whole amount, Р6)");
  // optional: #2363 q72 — scrolled down, «Итого» is the capsule (the sum alone); a tap opens the bar with its word «Итого»
  await require("../estimateLine.cjs").wholeBar(h);
  await h.expectText(/Итого \| \$794\.49/, "total");
  // DS §8.7а: the deposit row — «%», 10 in its field, $79.45 on the right
  h.expect((await h.page.getByTestId("est-deposit-pct").locator("visible=true").first().locator("input").inputValue()) === "10", "deposit 10%");
  h.expect((await require("../estimateTotals.cjs").sumIs(h, "est-deposit-row", "$79.45")) === "$79.45", "deposit");
  await h.shot("builder");
  await require("../estimateLine.cjs").saveSend(h); await h.page.waitForTimeout(800);
  await h.expectText(/Отправить клиенту/, "send sheet opens");
};
