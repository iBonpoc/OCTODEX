/**
 * e2e 506 — the signature pen (#2215). Two strokes on the visit's pad: «Отменить штрих» takes away only the last one,
 * «Очистить» everything; a single touch is a dot; the stroke ends exactly at the finger. Found by testID; the stroke's
 * path is read from the pad's svg (the path shown is the path stored — normalizeSignature leaves a phone-sized field as drawn).
 */
const { waited } = require("../sheet.cjs");
exports.run = async (h) => {
  const p = h.page;
  await h.go("/today");
  const raw = await p.evaluate(() => JSON.parse(localStorage.getItem("octo.db.v5")));
  const v = raw.db.visits.find((x) => x.id === "v1");
  v.step = "working";
  v.checklist = [];
  await h.seed("octo.db.v5", raw);
  await h.go("/visit/v1");
  const pad = p.getByTestId("signature-pad").locator("visible=true").first();
  await pad.waitFor();
  await pad.scrollIntoViewIfNeeded();
  const b = await pad.boundingBox();
  const strokes = async () => (await pad.locator("path").evaluateAll((els) => els.map((e) => e.getAttribute("d") || "").join(" ")).catch(() => "")).split("M").length - 1;
  // waits for the number of strokes drawn in the pad (what is checked), not for seconds
  const waitStrokes = async (n) =>
    h.expect(
      await waited(
        p.waitForFunction((n) => {
          const el = [...document.querySelectorAll('[data-testid="signature-pad"]')].find((e) => e.offsetParent);
          return !!el && [...el.querySelectorAll("path")].map((x) => x.getAttribute("d") || "").join(" ").split("M").length - 1 === n;
        }, n, { timeout: 3000 }),
      ),
      `the pad shows ${n} stroke(s)`,
    );
  const stroke = async (dy) => {
    const was = await strokes();
    await p.mouse.move(b.x + 20, b.y + b.height / 2 + dy);
    await p.mouse.down();
    for (let k = 1; k <= 10; k++) await p.mouse.move(b.x + 20 + k * 15, b.y + b.height / 2 + dy + (k % 2 ? 6 : -6), { steps: 2 });
    await p.mouse.up();
    await waitStrokes(was + 1);
  };
  const btn = (id) => p.getByTestId(id).locator("visible=true").first().getByRole("button");
  h.expect((await strokes()) === 0, "nothing drawn: no stroke");
  h.expect(await btn("signature-undo").isDisabled(), "«Отменить штрих» is off while nothing is drawn");
  await stroke(-20);
  await stroke(20);
  h.expect((await strokes()) === 2, `two strokes drawn (${await strokes()})`);
  await h.shot("two-strokes");
  await btn("signature-undo").click();
  await waitStrokes(1);
  h.expect((await strokes()) === 1, "undo: only the last stroke is gone");
  await btn("signature-undo").click();
  await waitStrokes(0);
  h.expect((await strokes()) === 0, "undo again: the pad is empty");
  // a single touch is a dot
  await p.mouse.move(b.x + 100, b.y + b.height / 2);
  await p.mouse.down();
  await p.mouse.up();
  await waitStrokes(1);
  h.expect((await strokes()) === 1, "a single touch gives a dot");
  await btn("signature-clear").click();
  await waitStrokes(0);
  h.expect((await strokes()) === 0, "clear: everything is gone");
  // #2260: the confirm button is whole on the screen at every width (the tools wrap, the button has its row), and the result of
  // the confirmation is visible: the note «Подпись передана» under the pad, or the step has moved on (the pad is gone)
  await stroke(0);
  const vw = p.viewportSize().width;
  const confirm = p.getByTestId("signature-pad").locator("visible=true").first().locator("xpath=ancestor::*[.//button][1]").getByRole("button", { name: /Подтвердить/ }).first();
  await confirm.scrollIntoViewIfNeeded();
  const cb = await confirm.boundingBox();
  h.expect(cb && cb.x >= 0 && cb.x + cb.width <= vw + 1, `the confirm button is inside the screen (${cb && Math.round(cb.x)}…${cb && Math.round(cb.x + cb.width)} of ${vw})`);
  h.expect(cb && cb.width >= 120, `the confirm button has its label room (${cb && Math.round(cb.width)} px)`);
  await h.shot("confirm-button");
  await confirm.click();
  // waits for what is checked: the note under the pad, or the pad gone (the step moved on)
  const shown = await waited(p.waitForFunction(() => !!document.querySelector('[data-testid="signature-sent"]') || !document.querySelector('[data-testid="signature-pad"]'), null, { timeout: 5000 }));
  h.expect(shown, "after «Подтвердить подпись»: the note «Подпись передана» or the next step is shown");
};
