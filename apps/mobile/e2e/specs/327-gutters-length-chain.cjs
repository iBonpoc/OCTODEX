/**
 * e2e 327 — #1316 (founder 13.11): a length typed WITHOUT «Done» — feet, «Далее», inches (the cursor goes on to the fraction by itself),
 * the fraction by buttons: 12′ 7⅝″ and 12′ 7 11/16″ (the sixteenths behind «1/16»). Every view. Finds things by testID and roles;
 * waits on what it checks (no pauses).
 */
const { skipLength } = require("../gutters.cjs");
const KEY = "octo.db.v5";

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  const field = (id) => tid(id).locator("input");
  const stroke = async (a, b) => {
    await p.mouse.move(a[0], a[1]);
    await p.mouse.down();
    for (let i = 1; i <= 12; i++) await p.mouse.move(a[0] + ((b[0] - a[0]) * i) / 12, a[1] + ((b[1] - a[1]) * i) / 12);
    await p.mouse.up();
  };
  const lengths = () => p.evaluate((k) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).filter((e) => e.kind === "run" && !e.deletedAt).map((e) => e.geom?.lengthIn).filter((x) => x !== undefined), KEY);
  /** the field has the focus AND its text is selected (a digit typed replaces it — `selectOnFocus`): typing before that would append */
  const focused = (id) => p.waitForFunction((tid0) => { const root = [...document.querySelectorAll(`[data-testid="${tid0}"]`)].find((e) => e.getBoundingClientRect().height > 0); const el = document.activeElement; return !!root && root.contains(el) && el.tagName === "INPUT" && el.selectionStart === 0 && el.selectionEnd === el.value.length; }, id, { timeout: 5000 });

  /** the sheet is gone; else say what it shows (a bad length, the fields) */
  const closed = async (what) => {
    try { await tid("quick-length").waitFor({ state: "detached", timeout: 5000 }); } catch (e) {
      throw new Error(`the length sheet stays ${what}: ${(await tid("quick-length").innerText()).replace(/\s+/g, " ")} | ft=${await field("quick-length-ft").inputValue()} in=${await field("quick-length-in").inputValue()}`);
    }
  };

  await h.go("/company/modules");
  await tid("module-gutters-enable").getByRole("button").click();
  await p.waitForFunction((k) => !!(JSON.parse(localStorage.getItem(k) || "null") || {}).db?.company?.modules?.gutters?.enabled, KEY, { timeout: 8000 });
  await h.go("/module/gutters/draw");
  await tid("draw-surface").waitFor({ timeout: 8000 });
  const b = await p.getByTestId("draw-surface").boundingBox();

  // 12′ 7⅝″: «12» → «Далее» → the inches have the focus → «7» → the cursor goes to the fraction by itself → ⅝ → «Применить»
  await stroke([b.x + b.width * 0.08, b.y + b.height * 0.3], [b.x + b.width * 0.4, b.y + b.height * 0.3]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await focused("quick-length-ft");
  await field("quick-length-ft").fill("12");
  await tid("quick-length-next").getByRole("button").click();
  await focused("quick-length-in");
  await p.keyboard.type("7");
  // the inches are typed to the end: the fraction row is the active step — «Далее» is gone
  await tid("quick-length-next").waitFor({ state: "detached", timeout: 5000 });
  await h.shot("fraction");
  await tid("quick-length-fracs").getByRole("radio", { name: "⅝", exact: true }).click();
  await tid("quick-length-apply").getByRole("button").click();
  await closed("after «Применить»");
  await p.waitForFunction(([k]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => e.kind === "run" && e.geom?.lengthIn === 151.625), [KEY], { timeout: 8000 });
  h.expect((await lengths()).includes(151.625), `12′ 7⅝″ = 151.625″ in the store (${JSON.stringify(await lengths())})`);

  // 12′ 7 11/16″: the same chain; «1/16» opens the sixteenths, 11/16 is one of them
  await stroke([b.x + b.width * 0.08, b.y + b.height * 0.5], [b.x + b.width * 0.4, b.y + b.height * 0.5]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await focused("quick-length-ft");
  await field("quick-length-ft").fill("12");
  // «Далее» and the digits at once (no waiting for the focus): they go into the inches, never into the feet («127»)
  await tid("quick-length-next").getByRole("button").click();
  await p.keyboard.type("7");
  h.expect((await field("quick-length-ft").inputValue()) === "12" && (await field("quick-length-in").inputValue()) === "7", `the digits after «Далее» are the inches (ft ${await field("quick-length-ft").inputValue()}, in ${await field("quick-length-in").inputValue()})`);
  await tid("quick-length-fracs-more").click();
  await tid("quick-length-fracs-sixteenths").waitFor({ timeout: 5000 });
  await tid("quick-length-fracs").getByRole("radio", { name: "11/16", exact: true }).click();
  await tid("quick-length-apply").getByRole("button").click();
  await closed("after «Применить» (11/16)");
  await p.waitForFunction(([k]) => ((JSON.parse(localStorage.getItem(k) || "null") || {}).db?.moduleData?.gutters?.elements || []).some((e) => e.kind === "run" && e.geom?.lengthIn === 151.6875), [KEY], { timeout: 8000 });
  h.expect((await lengths()).includes(151.6875), `12′ 7 11/16″ = 151.6875″ in the store (${JSON.stringify(await lengths())})`);

  // the stage follows the focus: a tap on the inches directly is «inches» too («Далее» stays); 15″ is wrong at once; 0″ goes on to the fraction by itself
  await stroke([b.x + b.width * 0.08, b.y + b.height * 0.7], [b.x + b.width * 0.4, b.y + b.height * 0.7]);
  await tid("quick-length").waitFor({ timeout: 5000 });
  await focused("quick-length-ft");
  await field("quick-length-in").focus(); // a tap on the inches (the focus is what the stage follows)
  await focused("quick-length-in");
  h.expect((await tid("quick-length-next").count()) === 1, "a tap on the inches: still «Далее» (the fraction is not the stage yet)");
  await p.keyboard.type("15");
  await tid("quick-length-bad").waitFor({ timeout: 5000 });
  await p.keyboard.press("Backspace");
  await p.keyboard.press("Backspace");
  await p.keyboard.type("0");
  await tid("quick-length-next").waitFor({ state: "detached", timeout: 5000 }); // 0″ needs no «Далее»: the fraction is the step
  await tid("quick-length-bad").waitFor({ state: "detached", timeout: 5000 });
};
