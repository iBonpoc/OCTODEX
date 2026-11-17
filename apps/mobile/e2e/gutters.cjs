// Gutters canvas: right after a gutter is drawn the «Длина желоба» sheet opens (feet focused, the drawn length in the
// fields). Tests that do not check the length press «Применить» — the drawn length stays («Отменить» takes the gutter away).
async function skipLength(p) {
  const skip = p.getByTestId("quick-length-apply").locator("visible=true").first();
  try {
    await skip.waitFor({ timeout: 2000 });
  } catch {
    return; // nothing was drawn (a stroke too short, a corner drag, read-only)
  }
  await skip.click();
  await p.getByTestId("quick-length").locator("visible=true").first().waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  await sheetGone(p);
}

// the sheet's own layer (the modal over the screen) is gone too — not only what was in it (GitHub 09.11: a stroke right
// after a sheet closed landed on the leaving sheet)
async function sheetGone(p) {
  await p.waitForFunction(() => ![...document.querySelectorAll('[aria-modal="true"]')].some((e) => e.getBoundingClientRect().height > 0), null, { timeout: 5000 }).catch(() => {});
}

// A downspout just put opens its menu by itself (founder 09.11): on the phone a sheet over the canvas — tests that go on
// drawing close it (the panel beside the canvas on 820/1280 does not cover it).
async function closeDsMenu(p) {
  const panel = p.getByTestId("attr-panel").locator("visible=true").first();
  try {
    await panel.waitFor({ timeout: 2000 });
  } catch {
    return;
  }
  if ((p.viewportSize()?.width ?? 0) > 390) return;
  await p.getByRole("button", { name: "Закрыть", exact: true }).first().click({ position: { x: 10, y: 10 } });
  await panel.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
}

// A sheet just closed may still lie over the canvas for a moment (slow machines, GitHub 09.11: a drag or a tap right
// after it landed on the leaving sheet). Waits until the point (page px) is the canvas itself — what the next tap needs.
async function canvasAt(p, x, y, timeout = 5000) {
  try {
    await p.waitForFunction(
      ([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return !!el && !!el.closest('[data-testid="draw-surface"]');
      },
      [x, y],
      { timeout },
    );
  } catch (e) {
    // say WHAT lies there (#1382: «Timeout 5000ms exceeded» named nothing): the layers at the point and the window
    const at = await p.evaluate(([px, py]) => [...document.elementsFromPoint(px, py)].slice(0, 5).map((q) => `${q.getAttribute("data-testid") || q.tagName}/${q.closest("[data-testid]")?.getAttribute("data-testid") || "-"}`), [x, y]).catch(() => ["?"]);
    throw new Error(`canvasAt: the canvas is not at (${Math.round(x)}, ${Math.round(y)}) after ${timeout} ms; there: ${at.join(" ; ")}; window ${JSON.stringify(p.viewportSize())}`);
  }
}


/** an element where it stays: the same box twice in a row */
async function stands(el) {
  let box = null;
  for (let i = 0; i < 40; i++) {
    const now = await el.boundingBox();
    if (now && box && now.x === box.x && now.y === box.y && now.width === box.width && now.height === box.height) return;
    box = now;
    await el.page().waitForTimeout(100);
  }
}

// «Готово» (#698): the drawing saved → «Просмотр замера»; waits until the review is up AND has stopped sliding in — the
// next press on it (a «Сделать смету», a «PDF», «Править чертёж») is cancelled while it moves (167, 152, 222; CHECKS §9 п.11)
async function openView(p) {
  await p.getByTestId("draw-done").locator("visible=true").first().getByRole("button").click();
  const view = p.getByTestId("view-screen").locator("visible=true").first();
  await view.waitFor({ timeout: 8000 });
  await stands(view);
}

// a button where it stays: a screen that has just come in can still be sliding, and a press on a button that moves under
// the finger is cancelled (no press at all — 152 / 222 on GitHub and under load, about 1 run in 40). Wait for two equal
// boxes in a row, then press.
async function pressWhenStill(btn) {
  await stands(btn);
  await btn.click();
}

// «Править чертёж» on the review → back on the canvas
async function backToCanvas(p) {
  await pressWhenStill(p.getByTestId("view-edit").locator("visible=true").first().getByRole("button"));
  await p.getByTestId("draw-surface").locator("visible=true").first().waitFor({ timeout: 8000 });
  await p.getByTestId("view-screen").locator("visible=true").first().waitFor({ state: "detached", timeout: 8000 });
}

// the total is on the review now, not under the drawing (#700): «Готово», read it, «Править чертёж» — the canvas again
async function viewTotal(p) {
  await openView(p);
  const tot = p.getByTestId("view-total").locator("visible=true");
  const total = (await tot.count()) ? Number((await tot.first().innerText()).replace(/[^\d.]/g, "")) : 0;
  const test = (await p.getByTestId("view-test-prices").locator("visible=true").count()) > 0;
  await backToCanvas(p);
  return { total, test };
}

/** the drawing is saved into the phone's copy (#1274: the cloud mark is gone — nothing is shown when all is saved, so a spec waits on the data itself) */
const savedOnce = (p, timeout = 8000) => p.waitForFunction(() => { const g = (JSON.parse(localStorage.getItem("octo.db.v5") || "null") || {}).db?.moduleData?.gutters; return !!g && (g.elements || []).some((e) => !e.deletedAt); }, null, { timeout });

// «Свойства» of the picked one on the phone (#1273): the button is gone from the toolbar — a double tap on the picked gutter (or its downspout)
// opens them; wider, the panel is beside the canvas already. The tool is «Желоб» first (with «Водосток» a tap on a gutter puts a downspout).
async function openProps(p, { force = false } = {}) {
  if (!force && (p.viewportSize()?.width ?? 0) > 390) return; // wider: the panel is beside the canvas already (a phone on its side asks with force)
  // the spec may have tapped «Желоб» just before: two taps on a tool open «Для новых желобов» (#1563 PR B) — this one is a first tap again
  await pastDoubleTap(p);
  await p.getByTestId("draw-tool-line").locator("visible=true").getByRole("button").click();
  const at = await p.evaluate(() => {
    const dots = [...document.querySelectorAll('[data-testid="draw-svg"] circle')].map((c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    const clear = (q) => dots.every((d) => Math.hypot(d[0] - q[0], d[1] - q[1]) > 24); // never a downspout's mark: that would open ITS menu
    const halo = document.querySelector('[data-testid="draw-svg"] [id^="halo-"]');
    if (halo) {
      const r = halo.getBoundingClientRect();
      const horizontal = r.width >= r.height;
      for (const k of [0.75, 0.3, 0.55, 0.9]) {
        const q = horizontal ? [r.x + r.width * k, r.y + r.height / 2] : [r.x + r.width / 2, r.y + r.height * k];
        if (clear(q)) return q;
      }
      return horizontal ? [r.x + r.width * 0.75, r.y + r.height / 2] : [r.x + r.width / 2, r.y + r.height * 0.75];
    }
    if (dots.length) return dots[0]; // a downspout is what is picked: its own mark
    // nothing is picked: take the first gutter — the tap below picks it, the second opens its properties
    const line = document.querySelector('[data-testid="draw-svg"] line:not([id^="halo"]):not([id^="grid"])');
    if (!line) return null;
    const r = line.getBoundingClientRect();
    return r.width >= r.height ? [r.x + r.width * 0.75, r.y + r.height / 2] : [r.x + r.width / 2, r.y + r.height * 0.75];
  });
  if (!at) throw new Error("openProps: no gutter on the canvas");
  await canvasAt(p, at[0], at[1]);
  // the second tap on the same object inside motion.doubleTapMs; tried again if the page took the two as single taps
  await doubleTapUntil(p, at[0], at[1], { fn: () => [...document.querySelectorAll('[data-testid="attr-panel"]')].some((e) => e.getBoundingClientRect().height > 0) }, "the properties did not open");
}

// two quick taps on one point: a double tap (motion.doubleTapMs, #1273)
async function doubleTap(p, x, y) {
  await p.mouse.click(x, y);
  await p.mouse.click(x, y);
}

// A double tap that is SEEN: the page measures the window `motion.doubleTapMs` when it handles the taps, so on a loaded page (CI) two clicks the
// spec sent a few ms apart can be handled more than that apart and are two single taps (#1382). Tries again until `done` is true — each time after
// the window is over, so the retry is a first tap + a second one, never the second half of the failed pair.
async function doubleTapUntil(p, x, y, done, what, tries = 4) {
  for (let i = 0; i < tries; i++) {
    if (i) await pastDoubleTap(p);
    await p.mouse.click(x, y);
    await p.mouse.click(x, y);
    try {
      await p.waitForFunction(done.fn, done.arg, { timeout: 1500 });
      return;
    } catch {
      /* the next try */
    }
  }
  throw new Error(`a double tap at (${Math.round(x)}, ${Math.round(y)}) did nothing in ${tries} tries: ${what}`);
}

// the window of a double tap is over (motion.doubleTapMs + a margin): the next tap is a FIRST tap again — waits on the clock, not a pause
async function pastDoubleTap(p) {
  await p.waitForFunction((t0) => Date.now() - t0 > 400, Date.now(), { polling: 50, timeout: 3000 });
}

// The downspout's menu (#1563, founder 14.11): it no longer opens by itself when one is put, nor on one tap with «Водосток» — two taps on its
// mark open it, as on anything else. `near` (page px): the mark nearest to it (the one just put); none — the last mark drawn.
async function openDsMenu(p, near) {
  await pastDoubleTap(p); // the tap that put it is not the first half of these two
  const marks = await p.getByTestId("draw-svg").first().locator("circle").evaluateAll((cs) => cs.map((c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  if (!marks.length) throw new Error("openDsMenu: no downspout mark on the drawing");
  const at = near ? marks.sort((u, v) => Math.hypot(u[0] - near[0], u[1] - near[1]) - Math.hypot(v[0] - near[0], v[1] - near[1]))[0] : marks[marks.length - 1];
  const open = { fn: () => [...document.querySelectorAll('[data-testid="attr-panel"]')].some((e) => e.getClientRects().length > 0), arg: null };
  await doubleTapUntil(p, at[0], at[1], open, "the downspout's menu opens on two taps");
}

// «Весь рисунок» (#1273): «вписать» left the header — it is a row of «⋯» (and a double tap on the empty place)
async function fitAll(p) {
  await p.getByTestId("draw-who").locator("visible=true").getByRole("button").click();
  await p.getByRole("menuitem", { name: "Весь рисунок", exact: true }).or(p.getByText("Весь рисунок", { exact: true })).last().click();
  await sheetGone(p); // the menu's own layer takes touches while it goes out: the next pinch or stroke must land on the canvas
  // the menu picks AFTER it has closed, and the view then settles into place: wait until the drawing stops moving, so the next
  // pinch is not fighting the settle (#1273: «вписать» is a row now, it was a button in the header)
  await p.waitForFunction(() => {
    const el = document.querySelector('[data-testid="draw-svg"] [id^="face-"], [data-testid="draw-svg"] line');
    if (!el) return true;
    const w = Math.round(el.getBoundingClientRect().width);
    const same = globalThis.__fitW === w;
    globalThis.__fitW = w;
    return same;
  }, null, { polling: 120, timeout: 5000 });
  await p.evaluate(() => { delete globalThis.__fitW; });
}

/** the open downspout's kind (its menu is open): «Ещё» first where the phone folds it (as e2e 253); `key` — rectPlain, rectRibbed, … */
async function pickDsKind(p, key, { save = true } = {}) {
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  await tid("attr-panel").first().waitFor({ timeout: 5000 });
  if (!(await tid(`attr-ds-kind-${key}`).count()) && (await tid("attr-more").count())) {
    await tid("attr-more").getByRole("button").click();
    await tid("attr-more-open").waitFor({ timeout: 5000 });
  }
  await tid(`attr-ds-kind-${key}`).click();
  await p.waitForFunction((k) => document.querySelector(`[data-testid="attr-ds-kind-${k}"]`)?.getAttribute("aria-checked") === "true", key, { timeout: 5000 });
  // the window works on a copy (#1858): the kind is on the drawing after «Сохранить» (the phone's sheet closes, wider the panel stays)
  if (save) await saveAttrs(p);
}

// The window of a gutter / downspout works on a copy (#1858, v6): a choice changes the window only; «Сохранить» at its bottom writes it.
// On the phone «Сохранить» closes the sheet; wider the panel stays on what is picked.
async function saveAttrs(p) {
  const btn = p.getByTestId("attr-save").locator("visible=true").first();
  await btn.getByRole("button").click();
  if ((p.viewportSize()?.width ?? 0) <= 390) await p.getByTestId("attr-panel").locator("visible=true").first().waitFor({ state: "detached", timeout: 5000 });
}

// a menu row of the window (SelectField): opens its menu at the row, picks the item by its key
async function chooseAttr(p, field, key) {
  await p.getByTestId(`${field}-button`).locator("visible=true").first().click();
  // up to 12 a menu at the row; more — a sheet with search (DS А2 → А3), its rows `<field>-picker-<key>`
  const item = p.getByTestId(`${field}-${key}`).or(p.getByTestId(`${field}-picker-${key}`)).locator("visible=true").first();
  await item.waitFor({ timeout: 5000 });
  const inSheet = ((await item.getAttribute("data-testid")) || "").startsWith(`${field}-picker-`);
  await item.click();
  if (inSheet) await sheetGone(p);
  else await item.waitFor({ state: "detached", timeout: 5000 });
}

// what a menu row of the window shows now (its value, or «Выберите»)
async function attrValue(p, field) {
  return (await p.getByTestId(`${field}-button`).locator("visible=true").first().innerText()).trim();
}

// how many choices a menu row of the window offers: opens its menu, counts, picks the first to close it (the window's copy only — not saved)
async function attrChoices(p, field) {
  await p.getByTestId(`${field}-button`).locator("visible=true").first().click();
  const menu = p.getByRole("menu").locator("visible=true").first();
  await menu.waitFor({ timeout: 5000 });
  const items = menu.getByRole("menuitem");
  const n = await items.count();
  await items.first().click();
  await menu.waitFor({ state: "detached", timeout: 5000 });
  return n;
}

// a menu row of the window by the word of the item (the item's own name in the menu)
async function chooseAttrByName(p, field, name) {
  await p.getByTestId(`${field}-button`).locator("visible=true").first().click();
  const menu = p.getByRole("menu").locator("visible=true").first();
  await menu.waitFor({ timeout: 5000 });
  await menu.getByRole("menuitem", { name, exact: true }).click();
  await menu.waitFor({ state: "detached", timeout: 5000 });
}

// the value a menu row of the window shows: the last line of the row (its label stands first, or above it)
async function attrChosen(p, field) {
  const lines = (await attrValue(p, field)).split("\n").map((x) => x.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? "";
}

module.exports = { chooseAttrByName, attrChosen, attrChoices, saveAttrs, chooseAttr, attrValue, pickDsKind, openDsMenu, openProps, fitAll, doubleTap, doubleTapUntil, pastDoubleTap, savedOnce, skipLength, closeDsMenu, canvasAt, sheetGone, openView, backToCanvas, viewTotal, pressWhenStill, stands };
