/**
 * e2e 173 — раскрой на углу и рулетка до 1/8″ (просьба основателя 08.11; docs/specs/33-gutters-canvas.md П20.14).
 * Every view.
 * - a gutter, its length 10′ (the sheet), then a second from its end turning 90° → 10′ 0⅛″ → the line shows «10′ ⅛″»;
 * - a tap on the corner → the sheet «Угол» has «Раскрой»: «угол 90°», for each gutter along the wall and along the face;
 *   the face differs from the wall by the gutter size (5″): longer on an outside corner, shorter on an inside one;
 * - the other kind → the face lengths follow;
 * - the corner's small drawing is there; the triangle: 10′, 10′ ⅛″ and between the ends for 110° → «угол 110°», the
 *   drawing turns, the face differs by 5·tan 35° = 3½″; «90°» puts it back.
 * Finds things by testID; waits on what it checks.
 */

const { doubleTap, canvasAt } = require("../gutters.cjs");

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const waitFor = async (ok, what, tries = 40) => {
    let v = await ok();
    for (let i = 0; i < tries && !v; i++) { await p.waitForTimeout(150); v = await ok(); }
    h.expect(!!v, what);
  };
  const stroke = async (a, b) => {
    // the length sheet of the last gutter may still be leaving: draw on the canvas, not on it (GitHub 09.11, #479)
    await canvasAt(p, a[0], a[1]);
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
  };
  /** «12′ 5⅝″» → inches */
  const inches = (s) => {
    const m = /(?:(\d+)′)?\s*(?:(\d+))?([⅛¼⅜½⅝¾⅞])?″?/.exec(s.trim());
    const fr = { "⅛": 1, "¼": 2, "⅜": 3, "½": 4, "⅝": 5, "¾": 6, "⅞": 7 }[m[3]] || 0;
    return Number(m[1] || 0) * 12 + Number(m[2] || 0) + fr / 8;
  };
  const typeLength = async (ftv, inv, eighths) => {
    await tid("quick-length").waitFor({ timeout: 5000 });
    await tid("quick-length-ft").locator("input").fill(String(ftv));
    await tid("quick-length-in").locator("input").fill(String(inv));
    if (eighths) {
      // the fraction is set explicitly, whatever the drawn length had: «›» of the tape until the label shows it (at most a whole inch)
      for (let i = 0; i < 16; i++) {
        const shown = (await tid("quick-length-frac").innerText().catch(() => "")).trim();
        if (shown.includes(eighths)) break;
        await tid("quick-length-tape-more").getByRole("button").click();
      }
      await tid("quick-length-frac").filter({ hasText: eighths }).waitFor({ timeout: 3000 });
    }
    await tid("quick-length-apply").getByRole("button").click();
    await waitFor(async () => (await tid("quick-length").count()) === 0, "the length sheet closes");
  };
  const cuts = async () => {
    const out = [];
    for (const card of await p.locator('[data-testid^="corner-cut-"]:visible:has([data-testid="cut-back"])').all()) {
      out.push({ back: inches(await card.getByTestId("cut-back").innerText()), front: inches(await card.getByTestId("cut-front").innerText()) });
    }
    return out;
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.4;
  const y0 = b.y + b.height * 0.25, y1 = b.y + b.height * 0.45;

  await stroke([x0, y0], [x1, y0]);
  await typeLength(10, 0);
  // the second gutter from the first one's end (it moved to 10′): the R cap marks it
  const cap = await p.getByTestId("draw-svg").first().locator('[id^="cap:"]').evaluateAll((gs) => gs.map((g) => { const r = g.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const end = cap.sort((a, c) => c[0] - a[0])[0];
  await stroke(end, [end[0], end[1] + (y1 - y0)]);
  await typeLength(10, 0, "⅛");
  await waitFor(async () => (await p.getByTestId("draw-svg").first().locator("text").evaluateAll((ts) => ts.map((t) => t.textContent))).some((t) => /^10′ ⅛″/.test(t || "")), "the label to 1/8″: «10′ ⅛″»");

  // a tap on the corner
  const corner = await p.getByTestId("draw-svg").first().locator('[id^="c:"]').boundingBox();
  await canvasAt(p, corner.x + corner.width / 2, corner.y + corner.height / 2); // the length sheet has gone off the canvas
  await doubleTap(p, corner.x + corner.width / 2, corner.y + corner.height / 2);
  await tid("corner-sheet").waitFor({ timeout: 5000 });
  await tid("corner-cut").waitFor({ timeout: 3000 });
  h.expect(/90°/.test(await tid("corner-cut-angle").innerText()), "the angle: 90°");
  const kind = (await tid("corner-kind").locator('[aria-checked="true"]').innerText()).trim();
  const c0 = await cuts();
  h.expect(c0.length === 2, `two gutters in the cut (${c0.length})`);
  const sign = kind === "наружный" ? 1 : -1;
  h.expect(c0.every((x) => Math.abs(x.front - x.back - sign * 5) < 0.01), `${kind}: the face ${sign > 0 ? "+" : "−"}5″ (${JSON.stringify(c0)})`);
  h.expect(c0.some((x) => x.back === 120) && c0.some((x) => x.back === 120.125), `along the wall: 10′ and 10′ ⅛″ (${JSON.stringify(c0)})`);
  await h.shot("cut");

  // the other kind → the face follows
  await tid("corner-kind").getByRole("radio", { name: kind === "наружный" ? "внутренний" : "наружный", exact: true }).click();
  // the sheet stays open after the choice (founder 09.11, версия 474): the choice shows, then the sheet is closed
  const kind1 = kind === "наружный" ? "внутренний" : "наружный";
  await waitFor(async () => ((await tid("corner-kind").locator('[aria-checked="true"]').innerText()).trim() === kind1), `${kind1} picked`);
  await p.getByRole("button", { name: /^(Закрыть|Close|Cerrar)$/ }).last().click({ position: { x: 10, y: 10 } });
  await waitFor(async () => (await tid("corner-sheet").count()) === 0, "the sheet closes");
  await canvasAt(p, corner.x + corner.width / 2, corner.y + corner.height / 2); // …and has gone off the canvas
  await doubleTap(p, corner.x + corner.width / 2, corner.y + corner.height / 2);
  await tid("corner-cut").waitFor({ timeout: 5000 });
  const c1 = await cuts();
  h.expect(c1.every((x) => Math.abs(x.front - x.back + sign * 5) < 0.01), `the other kind: the face ${sign > 0 ? "−" : "+"}5″ (${JSON.stringify(c1)})`);

  h.expect((await tid("corner-sketch").count()) === 1, "the corner's small drawing");

  // the triangle: the two gutters (prefilled) and straight between their ends for 110°
  const a = 120, bb = 120.125;
  const c = Math.sqrt(a * a + bb * bb - 2 * a * bb * Math.cos((110 * Math.PI) / 180));
  await tid("tri-c").locator("input").first().fill(String(Math.floor(c / 12)));
  await tid("tri-c").locator("input").nth(1).fill(String(Math.round((c % 12) * 8) / 8));
  await tid("tri-count").getByRole("button").click();
  await waitFor(async () => /110/.test(await tid("corner-cut-angle").innerText()), "the corner is 110° now");
  h.expect(/110/.test(await tid("tri-result").innerText()), "the triangle says 110°");
  const c2 = await cuts();
  h.expect(c2.every((x) => Math.abs(Math.abs(x.front - x.back) - 3.5) < 0.01), `110°: the face differs by 3½″ (${JSON.stringify(c2)})`);
  await h.shot("triangle");
  await tid("tri-90").getByRole("button").click();
  await waitFor(async () => /90°/.test(await tid("corner-cut-angle").innerText()), "«90°» puts it back");
};
