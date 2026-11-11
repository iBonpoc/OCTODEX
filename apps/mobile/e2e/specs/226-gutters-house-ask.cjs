/**
 * e2e 226 — #854 (audit G-01): an open line gets its first corner → «Дом с этой стороны?» once. Every view.
 * - one straight gutter: no question; the second, at a right angle (an open line with a corner): the bubble;
 * - «Да»: the side drawn is written on the line (houseSide on both gutters), the bubble goes, the next gutter drawn on
 *   does not bring it back;
 * - the same drawing again, «Нет — с другой»: the line turns — its sides are the other ones;
 * - it finds things by testID / id and waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

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
    await p.waitForTimeout(200);
  };
  const runs = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => !e.deletedAt && e.kind === "run"), KEY);
  // the sides of the gutters of the drawing in hand: those of measurements that were not there before it (`old`)
  let old = new Set();
  const sides = async () => (await runs()).filter((e) => !old.has(e.measurementId)).map((e) => e.geom.houseSide ?? null);

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");

  const drawL = async (third) => {
    await h.go("/module/gutters/draw");
    await tid("draw-surface").waitFor({ timeout: 8000 });
    const b = await p.getByTestId("draw-surface").boundingBox();
    const x0 = b.x + b.width * 0.15, x1 = b.x + b.width * 0.45, x2 = b.x + b.width * 0.7;
    const y0 = b.y + b.height * 0.25, y1 = b.y + b.height * 0.45;
    await stroke([x0, y0], [x1, y0]);
    h.expect((await tid("draw-house-ask").count()) === 0, "one straight gutter: no question");
    await stroke([x1, y0], [x1, y1]);
    await tid("draw-house-ask").waitFor({ timeout: 5000 });
    h.expect((await tid("draw-house-ask").innerText()).includes("Дом с этой стороны?"), "the question, in words");
    h.expect((await sides()).every((s) => s === null), "nothing written on the line yet");
    return { x1, x2, y1 };
  };

  // «Да»
  const k = await drawL();
  await tid("draw-house-yes").getByRole("button").click();
  await tid("draw-house-ask").waitFor({ state: "detached", timeout: 5000 });
  await waitFor(async () => (await sides()).length === 2 && (await sides()).every(Boolean), "«Да» writes the side on the whole line");
  const yes = await sides();
  // drawn on: the line is answered — not asked again
  await stroke([k.x1, k.y1], [k.x2, k.y1]);
  await p.waitForTimeout(300);
  h.expect((await tid("draw-house-ask").count()) === 0, "a third gutter on the answered line: no second question");

  // «Нет — с другой»: the same drawing, the other sides
  old = new Set((await runs()).map((e) => e.measurementId));
  await drawL();
  await tid("draw-house-no").getByRole("button").click();
  await tid("draw-house-ask").waitFor({ state: "detached", timeout: 5000 });
  await waitFor(async () => (await sides()).length === 2 && (await sides()).every(Boolean), "«Нет» writes the sides too");
  const no = await sides();
  h.expect(no.every((s, i) => s !== yes[i]), `«Нет — с другой» turned the line (${yes} → ${no})`);
};
