/**
 * e2e 221 — «Чертёж в PDF» (основатель 09.11, #509; docs/specs/33-gutters-canvas.md П20.25 п.4). Every view.
 * - «Просмотр замера» → «PDF клиенту»: the drawing (an SVG), the gutters with their lengths — no $, no cut, in the
 *   client's language (a draft for nobody: the company's language, en in the US);
 * - «PDF бригаде»: the drawing, «По стене» / «По лицевой», the corner, the parts — in the app's language (ru), no $.
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
  /** the next frame printed: its HTML (the print dialog itself is not opened) */
  const catchPrint = () =>
    p.evaluate(() => {
      window.__pdf = null;
      const add = document.body.appendChild.bind(document.body);
      document.body.appendChild = (el) => {
        const r = add(el);
        if (el.tagName === "IFRAME") el.contentWindow.print = () => { window.__pdf = el.contentDocument.documentElement.outerHTML; };
        return r;
      };
    });
  const printed = async () => {
    await p.waitForFunction(() => !!window.__pdf, null, { timeout: 8000 });
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
  await catchPrint();
  await tid("view-pdf-client").getByRole("button").click();
  const c = await printed();
  h.expect(c.includes("<svg"), "the client's PDF has the drawing");
  h.expect(c.includes("Gutter drawing") && c.includes("Length"), "in the client's language (the company's: en)");
  h.expect(!/\$\s?\d/.test(c), "no prices for the client");
  h.expect(!c.includes("At the face") && !c.includes("По лицевой"), "no cut for the client");

  // for the crew
  await catchPrint();
  await tid("view-pdf-crew").getByRole("button").click();
  const w = await printed();
  h.expect(w.includes("Раскрой для бригады"), "the crew's PDF in the app's language");
  h.expect(w.includes("По стене") && w.includes("По лицевой"), "along the wall and along the face");
  h.expect(w.includes("Углы") && w.includes("Детали"), "the corner's cut and the parts");
  h.expect(!/\$\s?\d/.test(w), "no prices for the crew");
  await h.shot("view-pdf");
};
