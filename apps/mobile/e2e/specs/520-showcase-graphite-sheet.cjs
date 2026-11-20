/**
 * e2e 520 — «Графит»: ЛИСТ витрины (#2292), section «Кнопки». One page that only scrolls (no tabs, no pages); every block shows
 * «Как сейчас» and the numbered variants at once; all of them are live. By testID:
 * С1 the sheet opens behind the pilot switch, with no tabs; the strip is sticky and scrolls the same page to a heading;
 * С2 every block shows «Как сейчас» + «Вариант 1» (+ «Вариант 2») at once, nothing is cut at the side;
 * С3 SWEEP: every shown button of every block, in every variant, is pressed — the block's counter goes up by one each time;
 * С4 «Загрузка» / «Выключено» on EVERY block that has them: the spinner shows (after the delay) on the variants, «Как сейчас» says it has no such state; switched-off samples ignore presses;
 * С5 the round button switches on and off (aria-pressed), «Как сейчас» too;
 * С2b «Основа» on examples: the theme switch, status / accent / surface, spacing and corners as three cards, the vibration block;
 * С7 «Поля»: every field of every variant types (phone mask, money format, errors with words, switched off), the date row opens;
 * С5b the one fold «Для разработчиков» is shut, opens and shuts;
 * С6 «Готовятся» is a plain list at the end; the pilot screen is still opened by its own button.
 */
const BLOCKS = [
  // id, the pressable ids of «Как сейчас», of «Вариант 1», of «Вариант 2» (the counter is the block's, one for all)
  { id: "main", now: ["gr-main-now-btn"], v1: ["gr-main-v1-btn"], v2: ["gr-main-v2-btn"] },
  { id: "second", now: ["gr-second-now-btn"], v1: ["gr-second-v1-btn"], v2: ["gr-second-v2-btn"] },
  { id: "ghost", now: ["gr-ghost-now-btn"], v1: ["gr-ghost-v1-btn"], v2: ["gr-ghost-v2-btn"] },
  { id: "danger", now: ["gr-danger-now-btn"], v1: ["gr-danger-v1-btn"], v2: ["gr-danger-v2-btn"] },
  { id: "icon", now: ["gr-icon-now-btn"], v1: ["gr-icon-v1-btn"], v2: ["gr-icon-v2-btn"] },
  { id: "round", now: ["gr-round-now-btn"], v1: ["gr-round-v1-btn"], v2: ["gr-round-v2-btn"] },
  { id: "bar", now: ["gr-bar-now-second", "gr-bar-now-main"], v1: ["gr-bar-v1-second", "gr-bar-v1-main"], v2: ["gr-bar-v2-second", "gr-bar-v2-main"] },
  { id: "plus", now: [], v1: ["gr-plus-v1-btn"], v2: ["gr-plus-v2-btn"] },
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
  h.expect((await p.getByTestId("gr-block-main").count()) === 1 && (await p.getByTestId("gr-block-theme").count()) === 1, "С1: «Основа» and «Кнопки» are on the same page");
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
    const ids = [`gr-${b.id}-now`, `gr-${b.id}-v1`, `gr-${b.id}-v2`];
    for (const id of ids) {
      await center(id);
      const box = await vis(id).boundingBox();
      h.expect(box && box.x >= 0 && box.x + box.width <= width + 1, `С2: ${id} is inside the window (${box && Math.round(box.x)}+${box && Math.round(box.width)} / ${width})`);
    }
  }

  // С2b — «Основа»: colour and measures are seen on examples; the theme switch flips the whole app; the spacing and the corners are three cards
  await center("gr-block-theme");
  // the card of the sample is the last painted box in the «Как сейчас» row (the plate «Сейчас в приложении» is before it)
  const surface = () => vis("gr-surface-now").evaluate((e) => getComputedStyle([...e.querySelectorAll("[style*='background-color']")].pop() ?? e).backgroundColor);
  const light0 = await surface();
  await vis("gr-theme-switch").click();
  await until("С2b the theme changed", (was) => {
    const e = document.querySelector('[data-testid="gr-surface-now"]');
    return getComputedStyle([...e.querySelectorAll("[style*='background-color']")].pop() ?? e).backgroundColor !== was;
  }, light0);
  await vis("gr-theme-switch").click();
  await until("С2b the theme is back", (was) => {
    const e = document.querySelector('[data-testid="gr-surface-now"]');
    return getComputedStyle([...e.querySelectorAll("[style*='background-color']")].pop() ?? e).backgroundColor === was;
  }, light0);
  for (const id of ["gr-status-now", "gr-status-v1", "gr-space-now-card", "gr-space-v1-card", "gr-radius-now-card", "gr-radius-v1-card"]) {
    await center(id);
    h.expect(await vis(id).isVisible(), `С2b: ${id} is on the sheet`);
  }
  // the spacing and the corners are CHOSEN: press a name — it is marked, the example is rebuilt (taller / rounder)
  const hs = async (id) => (await vis(id).boundingBox()).height;
  await center("gr-space-pick-dense");
  await vis("gr-space-pick-dense").click();
  const [nowDense, v1Dense] = [await hs("gr-space-now-card"), await hs("gr-space-v1-card")];
  await vis("gr-space-pick-loose").click();
  await until("С2b the loose card is taller", ([a, b]) => document.querySelector('[data-testid="gr-space-now-card"]').getBoundingClientRect().height > a && document.querySelector('[data-testid="gr-space-v1-card"]').getBoundingClientRect().height > b, [nowDense, v1Dense]);
  h.expect((await vis("gr-space-pick-loose").getAttribute("aria-checked")) === "true", "С2b: the chosen density is marked");
  const corner = (id) => vis(id).evaluate((e) => { for (let n = e; n; n = n.parentElement) { const r = parseFloat(getComputedStyle(n).borderTopLeftRadius); if (r > 0) return r; } return 0; });
  await center("gr-radius-pick-c1");
  await vis("gr-radius-pick-c1").click();
  const [c1Now, c1V1] = [await corner("gr-radius-now-card"), await corner("gr-radius-v1-card")];
  await vis("gr-radius-pick-c3").click();
  await until("С2b the corner became rounder", ([a, b]) => {
    const r = (id) => { for (let n = document.querySelector(`[data-testid="${id}"]`); n; n = n.parentElement) { const v = parseFloat(getComputedStyle(n).borderTopLeftRadius); if (v > 0) return v; } return 0; };
    return r("gr-radius-now-card") > a && r("gr-radius-v1-card") > b;
  }, [c1Now, c1V1]);
  // the sheet speaks plainly: no rule numbers, no pilot words, no digits in the spacing / corner names (service words are in the fold)
  const page = await vis("gr-sheet-page").innerText();
  h.expect(!/DESIGN-SYSTEM|§|#2254|Откат/.test(page), "С2b: no service words on the sheet outside the fold");
  // the vibration check is on the sheet as it is
  await center("showcase-haptics");
  h.expect(await vis("showcase-haptics").isVisible(), "С2b: the vibration block is on the sheet");
  // every response answers a press (in a browser nothing vibrates, the line under the buttons says which was pressed)
  for (const k of ["selection", "light", "medium", "success", "warning", "error"]) {
    await vis(`showcase-hap-${k}`).getByRole("button").click();
    await until(`С2b ${k} answered`, (kind) => /./.test(document.querySelector('[data-testid="showcase-hap-last"]')?.innerText || ""), k);
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

  // С4 — states on EVERY block that has the switches: «Загрузка» shows the spinner on the variants and «Как сейчас» says it has no
  // such state; «Выключено» stops the presses (all samples; the app's round button has no switched-off look and says so)
  const counterOf = (b, kind) => `gr-${b.id}-${kind}-count`;
  for (const b of BLOCKS.filter((x) => ["main", "second", "ghost", "danger", "icon"].includes(x.id))) {
    await center(`gr-${b.id}-loading`);
    await vis(`gr-${b.id}-loading`).click();
    for (const id of [...b.v1, ...b.v2]) {
      await vis(`${id}-spinner`).waitFor({ timeout: 4000 });
      h.expect((await vis(id).getAttribute("aria-busy")) === "true", `С4: ${id} is busy while loading`);
      const kind = b.v1.includes(id) ? "v1" : "v2";
      const n0 = await count(counterOf(b, kind));
      await center(id);
      await vis(id).click({ force: true, timeout: 2000 }).catch(() => undefined);
      await frames();
      h.expect((await count(counterOf(b, kind))) === n0, `С4: ${id} ignores presses while loading`);
    }
    h.expect(/такого состояния нет/.test(await vis(`gr-${b.id}-now`).innerText()), `С4: «Как сейчас» of ${b.id} says it has no waiting state`);
    if (b.id === "main") await h.shot("sheet-loading");
    await center(`gr-${b.id}-loading`);
    await vis(`gr-${b.id}-loading`).click();
    for (const id of [...b.v1, ...b.v2]) await p.getByTestId(`${id}-spinner`).waitFor({ state: "detached", timeout: 4000 });
  }
  for (const b of BLOCKS.filter((x) => x.id !== "plus")) {
    await center(`gr-${b.id}-disabled`);
    await vis(`gr-${b.id}-disabled`).click();
    await frames();
    for (const [kind, list] of [["now", b.now], ["v1", b.v1], ["v2", b.v2]]) {
      // the app's round button has no switched-off look: it still counts, and its block says so
      if (b.id === "round" && kind === "now") continue;
      for (const id of list) {
        const n0 = await count(counterOf(b, kind));
        await center(id);
        await vis(id).click({ force: true, timeout: 2000 }).catch(() => undefined);
        await frames();
        h.expect((await count(counterOf(b, kind))) === n0, `С4: switched-off ${id} ignores presses`);
      }
    }
    if (b.id === "round") h.expect(/нет выключенного вида/.test(await vis("gr-round-now").innerText()), "С4: the app's round button says it has no switched-off look");
    await center(`gr-${b.id}-disabled`);
    await vis(`gr-${b.id}-disabled`).click();
  }

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

  // С7 — «Поля»: every field of every variant types; the phone mask, the money format, the error with its words, the date row opens
  const input = async (id) => {
    await center(id);
    const el = vis(id);
    const tag = await el.evaluate((e) => e.tagName);
    return /^(INPUT|TEXTAREA)$/.test(tag) ? el : el.locator("input,textarea").first();
  };
  const leave = async (id) => {
    // leaving a field: press the block's own heading
    await (await input(id)).blur();
  };
  const blockText = (b) => vis(`gr-block-${b}`).innerText();
  const SAMPLES = (b) => [`gr-${b}-now-input`, `gr-${b}-v1-input`, `gr-${b}-v2-input`];
  // text
  for (const id of SAMPLES("ftext")) {
    const el = await input(id);
    await el.fill("Maria");
    h.expect((await el.inputValue()) === "Maria", `С7: ${id} takes text`);
  }
  await center("gr-ftext-required");
  await vis("gr-ftext-required").click();
  for (const id of SAMPLES("ftext")) {
    const el = await input(id);
    await el.fill("");
    await el.blur();
  }
  await until("С7 the required error shows on all three", () => (document.querySelector('[data-testid="gr-block-ftext"]').innerText.match(/Заполните поле/g) || []).length >= 3);
  await vis("gr-ftext-required").click();
  // phone: the mask and the error after leaving with a few digits
  for (const id of SAMPLES("fphone")) {
    const el = await input(id);
    await el.fill("6265550142");
    h.expect((await el.inputValue()) === "(626) 555-0142", `С7: ${id} masks the phone (${await el.inputValue()})`);
    await el.fill("626");
    await el.blur();
  }
  await until("С7 the phone error shows on all three", () => (document.querySelector('[data-testid="gr-block-fphone"]').innerText.match(/Нужно 10 цифр/g) || []).length >= 3);
  // money: «1234.5» → «1,234.50» on leaving
  for (const id of SAMPLES("fmoney")) {
    const el = await input(id);
    await el.fill("1234.5");
    await el.blur();
    await until(`С7 ${id} formats the sum`, (i) => {
      const e = document.querySelector(`[data-testid="${i}"]`);
      const v = (e.matches("input") ? e : e.querySelector("input")).value;
      return /1,234\.50/.test(v);
    }, id);
  }
  // note: several lines
  for (const id of SAMPLES("fnote")) {
    const el = await input(id);
    await el.fill("one\ntwo");
    h.expect(/one\s*two/.test(await el.inputValue()), `С7: ${id} takes two lines`);
  }
  // «Выключено»: the variants' inputs stop typing (the app's fields have no such state and say so)
  for (const b of ["ftext", "fphone", "fmoney", "fnote"]) {
    await center(`gr-${b}-disabled`);
    await vis(`gr-${b}-disabled`).click();
    for (const v of ["v1", "v2"]) h.expect(await (await input(`gr-${b}-${v}-input`)).evaluate((e) => e.disabled || e.readOnly), `С7: ${b} ${v} is switched off`);
    h.expect(/такого состояния нет/.test(await blockText(b)), `С7: ${b} «Как сейчас» says it has no switched-off state`);
    await vis(`gr-${b}-disabled`).click();
  }
  // the date: its row opens, a quick day is picked
  await center("gr-fdate-now");
  await vis("gr-fdate-now-row-button").click();
  await vis("gr-fdate-now-panel").waitFor({ timeout: 4000 });
  await vis("gr-fdate-now-today").click();
  await h.shot("sheet-fields");

  // С5b — the one fold: the service values, shut by default, opened by its button, shut again
  await vis("gr-jump-dev").click();
  await vis("gr-dev-toggle").waitFor({ timeout: 4000 });
  h.expect((await p.getByTestId("gr-dev-body").count()) === 0, "С5b: the service values are folded by default");
  await center("gr-dev-toggle");
  await vis("gr-dev-toggle").click();
  await vis("gr-dev-body").waitFor({ timeout: 4000 });
  // the coverage that left 264 / 457 (the token screens are not rows any more): the three token screens are drawn in the fold
  for (const id of ["tokens-color", "tokens-text", "tokens-print", "tokens-layout", "tokens-motion"]) h.expect((await p.getByTestId(`showcase-${id}`).count()) === 1, `С5b: the fold draws ${id}`);
  for (const g of ["themes", "font", "space", "radius", "motion"]) h.expect((await p.getByTestId(`token-group-${g}`).count()) === 1, `С5b: token group ${g} is in the fold`);
  const ok = await p.getByTestId("token-themes.status.ok.text").locator("xpath=../..").innerText();
  h.expect(/#[0-9A-Fa-f]{6}/.test(ok), `С5b: themes.status.ok.text shows a colour (${ok.replace(/\n/g, " ")})`);
  const motionTok = await p.getByTestId("token-motion.durFast").locator("xpath=../..").innerText();
  h.expect(/160/.test(motionTok), `С5b: motion.durFast shows 160 (${motionTok.replace(/\n/g, " ")})`);
  h.expect(/Только для модуля ниши/.test(await vis("gr-dev-body").innerText()), "С5b: the niche module's own tokens carry their note");
  await vis("gr-dev-toggle").click();
  await p.getByTestId("gr-dev-body").waitFor({ state: "detached", timeout: 4000 });

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
