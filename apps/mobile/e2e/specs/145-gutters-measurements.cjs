/**
 * e2e 145 — замер модуля Gutters в данных компании (docs/specs/33-gutters-screens.md П21 M5a; стык S4g). Every view.
 * - the trial on: a drawn run goes to the store (DB.moduleData.gutters — the phone's copy of the company's data that
 *   the queue sends with module.op); the address gets the measurement's id, a reload opens it again;
 * - a new canvas is a second measurement, its own; the first one opens by its id with its own drawing;
 * - a deleted run leaves the store (element.remove), its downspout too;
 * - a draft the previous version kept on the phone (M4b, device-wide, no owner) is forgotten, never moved in.
 * Finds things by testID; waits on what it checks.
 */
const { skipLength } = require("../gutters.cjs");
const DB_KEY = "octo.db.v5";
const OLD = "octo.mod.gutters.draft.v1";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const svg = () => p.getByTestId("draw-svg").first();
  const runs = () => svg().locator("line:not([id^=halo])").count();
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
  /** draws one run across the middle (at height share `at`) */
  const drawRun = async (at = 0.42) => {
    const b = await p.getByTestId("draw-surface").boundingBox();
    const y = b.y + b.height * at;
    await stroke([b.x + b.width * 0.25, y], [b.x + b.width * 0.7, y]);
    return { b, y };
  };
  const data = () => p.evaluate((k) => (JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters ?? { measurements: [], elements: [] }, DB_KEY);
  const idInUrl = () => new URL(p.url()).searchParams.get("m");
  const openCanvas = async (q = "") => {
    await h.go(`/module/gutters/draw${q}`);
    await tid("draw-surface").waitFor({ timeout: 8000 });
  };

  // the trial on
  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await waitFor(async () => /^Пробный/.test((await tid("module-gutters-status").innerText()).trim()), "trial on");

  // the first measurement: a run and a downspout
  await openCanvas();
  const { b, y } = await drawRun();
  await tid("draw-tool-ds").getByRole("button").click();
  await p.mouse.click(b.x + b.width * 0.47, y + 3);
  await waitFor(async () => (await svg().locator("circle").count()) === 1, "a downspout");
  await tid("draw-saved").waitFor({ timeout: 5000 });
  await waitFor(() => !!idInUrl(), "the address names the measurement");
  const m1 = idInUrl();
  await waitFor(async () => (await data()).elements.filter((e) => e.measurementId === m1).length === 2, "the store: the run and the downspout under the measurement");
  const d1 = await data();
  h.expect(d1.measurements.length === 1 && d1.measurements[0].id === m1 && d1.measurements[0].status === "draft", `one draft measurement (${JSON.stringify(d1.measurements)})`);
  await p.reload();
  await tid("draw-surface").waitFor({ timeout: 8000 });
  await waitFor(async () => (await runs()) === 1 && (await svg().locator("circle").count()) === 1, "a reload opens it again");
  await h.shot("first");

  // a new canvas: a second measurement of its own
  await openCanvas();
  h.expect((await runs()) === 0, "a new canvas is empty");
  await drawRun(0.3);
  await drawRun(0.6);
  await waitFor(async () => (await runs()) === 2, "two runs");
  await tid("draw-saved").waitFor({ timeout: 5000 });
  await waitFor(() => !!idInUrl() && idInUrl() !== m1, "its own id");
  const m2 = idInUrl();
  await waitFor(async () => (await data()).elements.filter((e) => e.measurementId === m2).length === 2, "the second measurement has its two runs");
  h.expect((await data()).elements.filter((e) => e.measurementId === m1).length === 2, "the first one is untouched");

  // delete a run of the second: it leaves the store
  await tid("draw-delete").getByRole("button").click(); // the picked one (the last drawn)
  await waitFor(async () => (await runs()) === 1, "one run left");
  await waitFor(async () => (await data()).elements.filter((e) => e.measurementId === m2).length === 1, "the store: element removed");

  // the first opens by its id with its own drawing
  await openCanvas(`?m=${m1}`);
  await waitFor(async () => (await runs()) === 1 && (await svg().locator("circle").count()) === 1, "the first measurement's drawing");
  await h.shot("reopened");

  // a draft the previous version kept on the phone (device-wide, no owner): forgotten, never moved into the company
  // signed in (review M5a №6)
  await p.evaluate(([k, v]) => localStorage.setItem(k, v), [OLD, JSON.stringify({ m: { id: "0b6f1c7e-1111-4aaa-8bbb-000000000145" }, elements: [] })]);
  await openCanvas();
  await waitFor(() => p.evaluate((k) => localStorage.getItem(k) === null, OLD), "the old draft is forgotten on the phone");
  h.expect((await runs()) === 0, "a new canvas is empty");
  h.expect((await data()).measurements.length === 2, "still two measurements: the old draft did not come in");
};
