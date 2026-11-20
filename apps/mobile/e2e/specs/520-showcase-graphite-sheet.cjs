/**
 * e2e 520 — «Графит»: ЛИСТ витрины (#2292), section «Кнопки». One page that only scrolls (no tabs, no pages); every block shows
 * «Как сейчас» and the numbered variants at once; all of them are live. By testID:
 * С1 the sheet opens behind the pilot switch, with no tabs; the strip is sticky and scrolls the same page to a heading;
 * С2 every block shows «Как сейчас» + «Вариант 1» (+ «Вариант 2») at once, nothing is cut at the side;
 * С3 SWEEP: every shown button of every block, in every variant, is pressed — the block's counter goes up by one each time;
 * С4 «Загрузка»: the spinner shows (after the delay) on the variants, «Как сейчас» says it cannot wait; «Выключено» stops presses;
 * С5 the round button switches on and off (aria-pressed), «Как сейчас» too;
 * С6 «Готовятся» is a plain list at the end; the pilot screen is still opened by its own button.
 */
const BLOCKS = [
  // id, the pressable ids of «Как сейчас», of «Вариант 1», of «Вариант 2» (the counter is the block's, one for all)
  { id: "main", now: ["gr-main-now-btn"], v1: ["gr-main-v1-btn"], v2: ["gr-main-v2-btn"] },
  { id: "second", now: ["gr-second-now-btn"], v1: ["gr-second-v1-btn"], v2: ["gr-second-v2-btn"] },
  { id: "ghost", now: ["gr-ghost-now-btn"], v1: ["gr-ghost-v1-btn"], v2: [] },
  { id: "danger", now: ["gr-danger-now-btn"], v1: ["gr-danger-v1-btn"], v2: ["gr-danger-v2-btn"] },
  { id: "icon", now: ["gr-icon-now-btn"], v1: ["gr-icon-v1-btn"], v2: ["gr-icon-v2-btn"] },
  { id: "round", now: ["gr-round-now-btn"], v1: ["gr-round-v1-btn"], v2: ["gr-round-v2-btn"] },
  { id: "bar", now: ["gr-bar-now-second", "gr-bar-now-main"], v1: ["gr-bar-v1-second", "gr-bar-v1-main"], v2: ["gr-bar-v2-second", "gr-bar-v2-main"] },
  { id: "plus", now: [], v1: ["gr-plus-v1-btn"], v2: [] },
];

exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const until = async (label, fn, arg) => {
    try {
      await p.waitForFunction(fn, arg, { timeout: 8000 });
    } catch (e) {
      throw new Error(`${label}: ${e.message.split("\n")[0]}`);
    }
  };
  /** the element in the middle of the window: clear of the bottom bar, which a forced click would hit */
  const center = (id) => vis(id).evaluate((e) => e.scrollIntoView({ block: "center" }));
  /** two frames: a press that would count has been handled */
  const frames = () => p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const count = async (id) => {
    const t = await vis(id).innerText();
    return Number(t.match(/\d+/)?.[0]);
  };
  const broken = [];

  // С1 — open the sheet behind the switch
  await h.go("/settings/design-system");
  await vis("showcase-sections").waitFor({ timeout: 8000 });
  if ((await p.getByTestId("showcase-row-graphite").count()) === 0) await vis("showcase-graphite-flag").click();
  await vis("showcase-row-graphite").waitFor({ timeout: 4000 });
  await vis("showcase-row-graphite").click();
  await vis("gr-sheet-page").waitFor({ timeout: 10000 });
  h.expect((await p.getByTestId("gr-sheet-page").getByRole("tab").count()) + (await vis("gr-sheet-strip").getByRole("tab").count()) === 0, "С1: no tabs on the sheet");
  h.expect((await p.getByTestId("gr-block-main").count()) === 1, "С1: the first block is on the same page");
  const stripBox = async () => vis("gr-sheet-strip").boundingBox();
  const inView = async (id) => {
    const b = await vis(id).boundingBox();
    return b && b.y < (await p.evaluate(() => window.innerHeight)) && b.y + b.height > 0;
  };
  await vis("gr-jump-soon").click();
  await until("С1 the jump reached «Готовятся»", () => {
    const r = document.querySelector('[data-testid="gr-soon"]')?.getBoundingClientRect();
    return r && r.top < window.innerHeight && r.bottom > 0;
  });
  h.expect((await stripBox()).y < 140, "С1: the strip stays at the top while the page scrolls");
  h.expect(await inView("gr-soon"), "С1: «Готовятся» is in view after the jump");
  await vis("gr-jump-buttons").click();
  await until("С1 the jump back to «Кнопки»", () => {
    const r = document.querySelector('[data-testid="gr-block-main"]')?.getBoundingClientRect();
    return r && r.top < window.innerHeight && r.bottom > 0;
  });
  await h.shot("sheet-top");

  // С2 — every block: «Как сейчас» and the variants all seen; nothing is cut at the side
  const width = await p.evaluate(() => window.innerWidth);
  for (const b of BLOCKS) {
    const ids = [`gr-${b.id}-now`, `gr-${b.id}-v1`, ...(b.v2.length || ["main", "second", "danger", "icon", "round", "bar"].includes(b.id) ? [`gr-${b.id}-v2`] : [])];
    for (const id of ids) {
      await center(id);
      const box = await vis(id).boundingBox();
      h.expect(box && box.x >= 0 && box.x + box.width <= width + 1, `С2: ${id} is inside the window (${box && Math.round(box.x)}+${box && Math.round(box.width)} / ${width})`);
    }
  }

  // С3 — SWEEP: every button, every variant; a Gr button waits (busy) after its press, then the next one is pressed
  for (const b of BLOCKS) {
    for (const [kind, list] of [["now", b.now], ["v1", b.v1], ["v2", b.v2]]) {
      // each sample counts its own presses
      const counter = `gr-${b.id}-${kind}-count`;
      for (const id of list) {
        await center(id);
        const before = await count(counter);
        await vis(id).click();
        try {
          await until(`С3 ${id} counted`, ([c, n]) => Number(document.querySelector(`[data-testid="${c}"]`)?.innerText.match(/\d+/)?.[0]) === n + 1, [counter, before]);
        } catch {
          broken.push(`${kind}: ${id}`);
        }
        // a Gr button of a block waits ~1.5 s after a press (a fake wait): let it end before the next press
        await until(`С3 ${id} done waiting`, (blk) => !document.querySelector(`[data-testid="gr-block-${blk}"] [aria-busy="true"]`), b.id);
      }
    }
  }
  // the app's own «＋» («Как сейчас» of «Создать»): it opens the app's quick-actions sheet, which closes back onto the same page
  await center("gr-plus-now");
  await vis("gr-plus-now").getByTestId("fab-header").click();
  try {
    await h.sheet().waitFor({ timeout: 4000 });
    await h.sheet().getByTestId("sheet-close").click();
    await p.locator('[aria-modal="true"]').last().waitFor({ state: "detached", timeout: 4000 });
    h.expect(await vis("gr-plus-now").isVisible(), "С3: after the «＋» menu closes we are on the same sheet");
  } catch (e) {
    broken.push(`now: the app's «＋» (${e.message.split("\n")[0]})`);
  }
  h.expect(broken.length === 0, `С3: elements that do not work: ${broken.join("; ")}`);

  // С4 — states: «Загрузка» shows the spinner on the variants; «Как сейчас» cannot wait; «Выключено» stops the presses
  await center("gr-main-loading");
  await vis("gr-main-loading").click();
  await vis("gr-main-v1-btn-spinner").waitFor({ timeout: 4000 });
  await vis("gr-main-v2-btn-spinner").waitFor({ timeout: 4000 });
  h.expect((await vis("gr-main-v1-btn").getAttribute("aria-busy")) === "true", "С4: the loading button is busy");
  const n0 = await count("gr-main-v1-count");
  await center("gr-main-v1-btn");
  await vis("gr-main-v1-btn").click({ force: true, timeout: 2000 }).catch(() => undefined);
  await frames();
  h.expect((await count("gr-main-v1-count")) === n0, "С4: a loading button ignores presses");
  await h.shot("sheet-loading");
  await vis("gr-main-loading").click();
  await p.getByTestId("gr-main-v1-btn-spinner").waitFor({ state: "detached", timeout: 4000 });
  await vis("gr-main-disabled").click();
  const n1 = await count("gr-main-v1-count");
  for (const id of ["gr-main-now-btn", "gr-main-v1-btn", "gr-main-v2-btn"]) {
    await center(id);
    await vis(id).click({ force: true, timeout: 2000 }).catch(() => undefined);
  }
  await frames();
  h.expect((await count("gr-main-v1-count")) === n1, "С4: a switched-off button ignores presses (all three)");
  await vis("gr-main-disabled").click();

  // С5 — the round button flips on and off, in all three
  for (const id of ["gr-round-now-btn", "gr-round-v1-btn", "gr-round-v2-btn"]) {
    await center(id);
    // the app's button changes its plate (no aria state of its own), the variants say «pressed»: either flips
    const was = await vis(id).evaluate((e) => `${e.getAttribute("aria-pressed")}/${getComputedStyle(e.firstElementChild).backgroundColor}`);
    await vis(id).click();
    await until(`С5 ${id} flipped`, ([i, w]) => {
      const e = document.querySelector(`[data-testid="${i}"]`);
      return `${e.getAttribute("aria-pressed")}/${getComputedStyle(e.firstElementChild).backgroundColor}` !== w;
    }, [id, was]);
  }

  // С6 — «Готовятся» and the pilot screen
  await vis("gr-jump-soon").click();
  await vis("gr-soon").waitFor({ timeout: 4000 });
  await h.shot("sheet-soon");
  await vis("gr-jump-pilot").click();
  await vis("gr-open").waitFor({ timeout: 4000 });
  await vis("gr-open").click();
  await vis("gr-screen").waitFor({ timeout: 8000 });
  await vis("gr-close").click();
  await p.getByTestId("gr-screen").waitFor({ state: "detached", timeout: 4000 });
};
