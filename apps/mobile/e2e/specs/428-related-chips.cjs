/**
 * e2e 428 — «Связано» is chips (#1495 п.3, DS §12.3 п.6), the director, every view, by testID:
 * each parent of an invoice and of a receipt is a chip with a plate (a painted background or a frame) and «›» in its words —
 * not bare text with an icon; the chip still opens its parent. (v2 #2350: the job's header names its client and address, so its
 * «Связано» hides them — «одна и та же информация на экране — один раз», features/RelatedBlock `hide`.)
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  const check = async (path, kinds) => {
    await h.go(path);
    for (const k of kinds) {
      await tid(`related-${k}`).waitFor({ timeout: 8000 });
      const r = await tid(`related-${k}`).evaluate((e) => {
        const painted = (el) => {
          const s = getComputedStyle(el);
          const bg = s.backgroundColor;
          return (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") || parseFloat(s.borderTopWidth) > 0;
        };
        // the pressable itself or the child that draws the plate
        const plate = painted(e) || [...e.querySelectorAll("*")].some(painted);
        return { plate, text: e.innerText };
      });
      h.expect(r.plate, `${path}: the «${k}» link has a plate`);
      h.expect(/›\s*$/.test(r.text.trim()), `${path}: the «${k}» link ends with «›» (${r.text.trim()})`);
    }
  };
  await check("/invoice/i1", ["job", "customer"]);
  await h.shot("invoice");
  await check("/receipt/pay3", ["invoice", "job", "customer"]);
  // a chip still opens its parent
  await tid("related-customer").click();
  await p.waitForURL(/\/client\//, { timeout: 8000 });
};
