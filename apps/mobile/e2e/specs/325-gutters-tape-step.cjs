/**
 * e2e 325 — #1315 (founder 13.11: «шаг между метками больше, потому что тяжело попадать»): the tape's marks are 16 px apart (they were 8):
 * a drag of one mark (16 px) is exactly 1/16″ more; a short drag (5 px — it was a whole mark before) moves nothing, the tape
 * settles back on its mark. Every view. Finds things by testID; waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
  };
  /** the big value above the tape */
  const value = async () => (await tid("quick-length-tape-value").innerText()).replace(/\s+/g, " ").trim();
  /** a length as the tape writes it («25′ 6″», «25′ 6 3/8″», «7/16″») in sixteenths of an inch */
  const s16 = (t) => {
    const ft = Number((t.match(/(\d+)′/) || [0, 0])[1]);
    const m = t.replace(/\d+′/, "").trim().match(/^(?:(\d+))?\s*(?:(\d+)\/(\d+))?\s*″?$/);
    if (!m) throw new Error(`cannot read the length «${t}»`);
    return ft * 192 + Number(m[1] || 0) * 16 + Number(m[2] || 0) * (16 / Number(m[3] || 16));
  };
  /** a slow drag of `px` to the left and a lift with no flick: the tape follows the finger 1:1 (one mark = `tape-tick` px) */
  const drag = async (px) => {
    const tb = await tid("quick-length-tape").boundingBox();
    const cx = tb.x + tb.width / 2, cy = tb.y + tb.height / 2;
    await p.mouse.move(cx, cy);
    await p.mouse.down();
    for (let i = 1; i <= 4; i++) await p.mouse.move(cx - (px * i) / 4, cy);
    await p.mouse.move(cx - px, cy);
    await p.mouse.up();
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();
  const y = b.y + b.height * 0.42;
  await stroke([b.x + b.width * 0.08, y], [b.x + b.width * 0.4, y]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await tid("quick-length-tape").waitFor({ timeout: 5000 });
  const v0 = await value();
  const base = s16(v0);
  /** where the tape and «Применить» stand when the window opens (#2414: they stay there, below) */
  const ys = async () => ({ tape: (await tid("quick-length-tape").boundingBox()).y, apply: (await tid("quick-length-apply").boundingBox()).y });
  const y0 = await ys();
  /** the browser has drawn what the lift left: two frames (the tape settles in the one the finger lifts) */
  const settled = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  // 5 px is a third of a mark: the tape settles back — nothing changed (read AFTER the lift settled, not before the drag acted)
  await drag(5);
  await settled();
  h.expect(s16(await value()) === base, `5 px moves nothing (${v0} → ${await value()})`);

  // 16 px is one mark: exactly 1/16″ more, whatever the length the screen's width gave the line
  await drag(16);
  await settled();
  const v1 = await value();
  h.expect(s16(v1) === base + 1, `16 px = one mark, 1/16″ more (${v0} = ${base}/16 → ${v1} = ${s16(v1)}/16)`);
  const y1 = await ys();
  h.expect(Math.abs(y1.tape - y0.tape) <= 0.5 && Math.abs(y1.apply - y0.apply) <= 0.5, `the first 1/16″ moves nothing over the tape (#2414): tape ${y0.tape}→${y1.tape}, apply ${y0.apply}→${y1.apply}`);
  await h.shot("one-mark");

  // #2414 (founder 22.11: «размер прыгает, „Применить“ перескакивает»): a slow pull over 36 marks (every sixteenth — 11/16,
  // 15/16, a whole inch) — the tape stays under the finger and «Применить» where it was: nothing over them grows or wraps
  // (the fraction beside the inches wrapped the row by 52 px, the sixteenths' row came in by 40 px)
  const moved = [];
  // two pulls of 18 marks (each fits the tape at 390): 36 sixteenths, over an odd one, 11/16 … 15/16 and a whole inch
  for (let pull = 0; pull < 2; pull++) {
    const tb = await tid("quick-length-tape").boundingBox();
    const px = tb.x + tb.width - 8, py = tb.y + tb.height / 2;
    await p.mouse.move(px, py);
    await p.mouse.down();
    for (let i = 1; i <= 18; i++) {
      await p.mouse.move(px - i * 16, py);
      await settled();
      const yn = await ys();
      if (Math.abs(yn.tape - y0.tape) > 0.5 || Math.abs(yn.apply - y0.apply) > 0.5) moved.push(`${await value()}: tape ${y0.tape}→${yn.tape}, apply ${y0.apply}→${yn.apply}`);
    }
    await p.mouse.up();
    await settled();
  }
  h.expect(moved.length === 0, `the tape and «Применить» stay put while the tape is pulled (#2414): ${moved.slice(0, 4).join("; ")}`);
};
