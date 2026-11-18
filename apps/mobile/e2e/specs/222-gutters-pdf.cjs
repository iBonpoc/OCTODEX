/**
 * e2e 222 — «Чертёж в PDF» (основатель 09.11, #509; docs/specs/33-gutters-canvas.md П20.25 п.4). Every view.
 * - «Просмотр замера» → «PDF клиенту»: the drawing (an SVG), the gutters with their lengths — no $, no cut, in the
 *   client's language (a draft for nobody: the company's language, en in the US);
 * - «PDF бригаде»: the drawing, «At the wall» / «At the face», the corner, the parts — in the company's document language (en;
 *   never the app's — ru here, #2158 rule 7), no $.
 * The web prints from a hidden frame: the spec catches the frame's HTML instead of the print dialog.
 */
const { skipLength, openView } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
    await skipLength(p);
  };
  /** the next frame printed: its HTML. The print dialog is not opened (print is replaced as the frame comes in), and the
   *  HTML is read from the new frame itself — the frame's window can be replaced after it is added (about:blank), so
   *  a replaced print alone sometimes never fired (820 light under load, merge of #726) */
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
  /** a new frame with the drawing in it, within `ms` */
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
  /** the button where it stays: the review slides in, and a press on a button still moving is cancelled (no frame at all,
   *  1 run in ~40 under load: «no frames») — so wait for it to stand, press, and press again only if nothing was printed */
  const printVia = async (id, what) => {
    const btn = tid(id).getByRole("button");
    let box = null;
    for (let i = 0; i < 40; i++) {
      const now = await btn.boundingBox();
      if (now && box && now.x === box.x && now.y === box.y) break;
      box = now;
      await p.waitForTimeout(100);
    }
    await catchPrint();
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      await btn.click();
      ok = await framed(i < 2 ? 3000 : 8000);
    }
    if (!ok) {
      const seen = await p.evaluate(() => [...document.querySelectorAll("iframe")].map((f) => `${f.dataset.seen ? "old" : "new"}:${(f.contentDocument?.body?.innerHTML ?? "-").length}`).join(","));
      throw new Error(`${what}: no printed frame after 3 presses (${seen || "no frames"})`);
    }
    return p.evaluate(() => window.__pdf);
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.35;
  const x0 = b.x + b.width * 0.2, x1 = b.x + b.width * 0.6;
  await stroke([x0, y], [x1, y]);
  await stroke([x1, y], [x1, y + b.height * 0.2]);
  await waitFor(async () => (await p.getByTestId("draw-svg").first().locator("line:not([id^=halo])").count()) === 2, "an L — a corner");
  await tid("draw-done").waitFor({ timeout: 8000 });
  await openView(p);

  // for the client
  const c = await printVia("view-pdf-client", "client");
  h.expect(c.includes("<svg"), "the client's PDF has the drawing");
  h.expect(c.includes("Gutter drawing") && c.includes("Length"), "in the client's language (the company's: en)");
  h.expect(!/\$\s?\d/.test(c), "no prices for the client");
  h.expect(!c.includes("At the face") && !c.includes("По лицевой"), "no cut for the client");

  // for the crew
  const w = await printVia("view-pdf-crew", "crew");
  // the company's document language (en), never the app's (ru here) — #2158, rule 7
  h.expect(w.includes("Cut list for the crew") && !w.includes("Раскрой для бригады"), "the crew's PDF in the company's language, not the app's"); // i18n-old: ok — the app's words must be absent
  h.expect(w.includes("At the wall") && w.includes("At the face"), "along the wall and along the face");
  h.expect(w.includes("Corners") && w.includes("Parts"), "the corner's cut and the parts");
  h.expect(!/\$\s?\d/.test(w), "no prices for the crew");
  // #1090: the parts read as words and feet-inches (founder, build 1039: «73.16666666666667 фт», «coil · 11.875», «touch_up_paint»)
  const parts = w.slice(w.indexOf("Parts"));
  h.expect(parts.includes("′"), "the parts' lengths are feet-inches");
  // a metal's thickness «0.027″» is a size, not a long decimal (#1766: it was «.027», a code)
  h.expect(!/\d\.\d{3,}(?!\d*″)/.test(parts), "no long decimal in the parts: " + (parts.match(/\d+\.\d{3,}(?!\d*″)[^<]*/) || [""])[0]);
  h.expect(!/touch_up_paint|dsstick|aluminum|(>|· )(coil|rivet)( ·|<)/.test(parts), "no bare code in a part's name");
  h.expect(!/ (фт|ft)\b/.test(parts) || !/\d\.\d/.test(parts), "no «N.N ft»");
  h.expect(!/[А-Яа-яЁё]/.test(w.replace(/<style[\s\S]*?<\/style>/g, "")), "no Russian word in the crew's PDF (the app is in Russian)");
  await h.shot("view-pdf");
};
