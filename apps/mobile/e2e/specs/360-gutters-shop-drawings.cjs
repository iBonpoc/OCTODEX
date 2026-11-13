/**
 * e2e 360 — «Рабочие чертежи» (основатель 13.11, #1349; docs/specs/33-gutters-shop-drawings.md). Every view.
 * «Просмотр замера» → «Документы»:
 * - «Рабочие чертежи» → the menu «Бумага» (one row, founder 13.11: «объединить в одну»): «11×17» — a page of 11 × 17
 *   sheets, the plan G-1 (the app's language, ru) and the schedules G-2; «Letter» — the same sheets reduced whole;
 * - «Заказ материалов»: the supplier's order, in English, on Letter.
 * The web prints from a hidden frame: the spec catches the frame's HTML instead of the print dialog. Finds things by
 * testID; waits on what it checks (no pauses).
 */
const { skipLength, openView } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  const waitRuns = (n) => p.waitForFunction(([k, n]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).length === n, [KEY, n], { timeout: 8000 });
  /** the next frame printed: its HTML (the print dialog is not opened) */
  const catchPrint = () =>
    p.evaluate(() => {
      window.__pdf = null;
      for (const f of document.querySelectorAll("iframe")) f.dataset.seen = "1";
      if (window.__printHooked) return;
      window.__printHooked = true;
      const add = document.body.appendChild.bind(document.body);
      document.body.appendChild = (el) => {
        const r = add(el);
        if (el.tagName === "IFRAME") el.contentWindow.print = () => {};
        return r;
      };
    });
  const framed = (ms) =>
    p
      .waitForFunction(
        () => {
          const f = [...document.querySelectorAll("iframe:not([data-seen])")].find((x) => x.contentDocument?.body?.innerHTML.includes("<svg"));
          if (f) window.__pdf = f.contentDocument.documentElement.outerHTML;
          return !!window.__pdf;
        },
        null,
        { timeout: ms },
      )
      .then(() => true, () => false);
  /** press where the button stands (the review slides in: a press on a moving button is cancelled) and read the frame */
  let shot = false;
  const printVia = async (id, choice) => {
    const btn = tid(id).getByRole("button");
    await btn.scrollIntoViewIfNeeded();
    await catchPrint();
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      await btn.click();
      // the paper's menu: the choice prints, and the menu goes
      if (choice) {
        // a press on a button still moving is cancelled: no menu — press again
        const open = await tid(choice).waitFor({ timeout: 3000 }).then(() => true, () => false);
        if (!open) continue;
        if (!shot) { shot = true; await h.shot("view-shop-paper"); }
        await tid(choice).click();
        await p.getByTestId(choice).waitFor({ state: "hidden", timeout: 5000 });
      }
      ok = await framed(i < 2 ? 3000 : 8000);
    }
    h.expect(ok, `${id}: a printed frame`);
    return p.evaluate(() => window.__pdf);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  const x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.6;
  await stroke([x0, y], [x1, y]);
  await waitRuns(1);
  await stroke([x1, y], [x1, y + b.height * 0.2]);
  await waitRuns(2);
  await tid("draw-done").waitFor({ timeout: 8000 });
  await openView(p);
  await tid("view-doc-shop").waitFor({ timeout: 8000 });

  // the drawings at their own size: the plan, then the schedules — in the app's language
  const d = await printVia("view-pdf-shop", "view-shop-paper-ansiB");
  h.expect(d.includes("@page{size:11in 17in"), "11 × 17 pages");
  h.expect((d.match(/<svg/g) || []).length >= 2, "a plan sheet and a schedules sheet");
  h.expect(d.includes(">G-1<") && d.includes(">G-2<"), "sheets G-1 and G-2");
  h.expect(d.includes("ПЛАН ВОДОСТОКОВ — ЭТАЖ 1") && d.includes("ВЕДОМОСТЬ ЖЕЛОБОВ"), "the plan and the schedule, in the app's language");
  h.expect(d.includes(">1-1<") && d.includes(">1-2<") && d.includes(">90°<"), "two segments and the corner's angle");
  h.expect(d.includes("НЕ ДЛЯ РАЗРЕШЕНИЯ"), "«not for permit»");
  h.expect(!/\$\s?\d/.test(d), "no prices on the drawings");
  const pts = [...d.matchAll(/font-size="([\d.]+)"/g)].map((m) => (Number(m[1]) / 96) * 72);
  h.expect(Math.min(...pts) >= 10.99, `no text below 11 pt (${Math.min(...pts).toFixed(2)})`);

  // the same sheets reduced to Letter
  h.expect((await p.getByTestId("view-docs").locator('[data-testid^="view-doc-"]').count()) === 4, "four documents: the client's, the crew's, the shop drawings (one row), the order");
  const l = await printVia("view-pdf-shop", "view-shop-paper-letter");
  h.expect(l.includes("@page{size:8.5in 11in"), "Letter pages");
  h.expect(l.includes('height="11.000in"') && l.includes("ПЛАН ВОДОСТОКОВ"), "the whole sheet reduced to the page");

  // the supplier's order: English, on Letter
  const o = await printVia("view-pdf-shop-order");
  h.expect(o.includes("MATERIAL ORDER") && o.includes("SUPPLIER") && o.includes(">MO-1<"), "the order, in English");
  h.expect(o.includes("@page{size:8.5in 11in"), "the order on Letter");
  h.expect(!/\$\s?\d/.test(o), "no prices in the order");
  await h.shot("view-shop-docs");
};
