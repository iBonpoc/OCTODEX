const { pressEscUntilClosed } = require("./sheet.cjs");
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
  // the window's own «Сохранить» (DS §7.3, #2412 PR3): what was picked in it stays; nothing picked — it just closes
  await p.getByTestId("attr-win-save").locator("visible=true").first().getByRole("button").click();
  await panel.waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
  await sheetGone(p);
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

// The fields of the gutter's / downspout's window (#2412 G1): every value is a SelectField — the field `<id>`, its button
// `<id>-button` (shows the value), a menu at it (items `<id>-<key>`) or a list over the sheet (rows `<id>-picker-<key>`).
/** «Ещё» of the window open (every width has it; a no-op when it is open already) */
async function openAttrMore(p) {
  const tid = (id) => p.getByTestId(id).locator("visible=true");
  await tid("attr-panel").first().waitFor({ timeout: 5000 });
  if (await tid("attr-more").count()) {
    await tid("attr-more-toggle").first().click();
    await tid("attr-more-open").first().waitFor({ timeout: 5000 });
  }
}

/** what a field shows (its button's text) */
async function attrShown(p, id) {
  return (await p.getByTestId(`${id}-button`).locator("visible=true").first().innerText()).trim();
}

/** the keys a field offers: opens its menu or list, reads the items, closes it (attrClose) */
async function attrKeys(p, id) {
  const button = p.getByTestId(`${id}-button`).locator("visible=true").first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const items = p.locator(`[data-testid^="${id}-"]:not([data-testid="${id}-button"]):not([data-testid="${id}-picker"]):not([data-testid^="${id}-picker-search"])`).locator("visible=true");
  await items.first().waitFor({ timeout: 5000 });
  const ids = await items.evaluateAll((es) => es.map((e) => e.getAttribute("data-testid")));
  await attrClose(p, id);
  return ids.map((t) => t.slice(id.length + 1).replace(/^picker-/, ""));
}

/** the key a field's MENU marks as chosen (read as selected): opens it, reads, closes it (attrClose) */
async function attrChosen(p, id) {
  const button = p.getByTestId(`${id}-button`).locator("visible=true").first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const items = p.getByRole("menu").locator(`[data-testid^="${id}-"]`).locator("visible=true");
  await items.first().waitFor({ timeout: 5000 });
  // the chosen item: read as selected, or (the web does not always say it) its check — the mark in the item's first place
  const on = await items.evaluateAll((es) => es.filter((e) => e.getAttribute("aria-selected") === "true" || !!e.firstElementChild?.querySelector("svg")).map((e) => e.getAttribute("data-testid")));
  await attrClose(p, id);
  return on.length === 1 ? on[0].slice(id.length + 1) : null;
}

/** the open menu or list of a field closed by Esc (again while it stays: an Esc in its first frames is lost), then gone */
async function attrClose(p, id) {
  const picker = p.getByTestId(`${id}-picker`).locator("visible=true");
  // a list (the colour field's, G1 PR2) is a sheet of its own over the window's: never Esc (on 390 it may reach the window under it,
  // and its backdrop is still moving); a menu — Esc
  if (await picker.count()) {
    // the chosen row again: the list closes, the value stays (the same value is no edit)
    const rows = p.locator(`[data-testid^="${id}-picker-"]:not([data-testid^="${id}-picker-search"])`).locator("visible=true");
    const i = await rows.evaluateAll((es) => Math.max(0, es.findIndex((e) => !!e.querySelector('[aria-selected="true"]') || e.getAttribute("aria-selected") === "true")));
    await rows.nth(i).click();
  } else await pressEscUntilClosed(p, p.getByRole("menu").first());
  await attrShut(p, id);
}

// the field's menu or list is gone (not only its items: the menu's own layer takes touches while it goes out)
async function attrShut(p, id) {
  await p.waitForFunction((x) => {
    const shown = (sel) => [...document.querySelectorAll(sel)].some((e) => e.getClientRects().length > 0);
    const b = [...document.querySelectorAll(`[data-testid="${x}-button"]`)].find((e) => e.getClientRects().length > 0);
    return !!b && b.getAttribute("aria-expanded") !== "true" && !shown('[role="menu"]') && !shown(`[data-testid="${x}-picker"]`);
  }, id, { timeout: 5000 });
}

/** pick `key` in a field: opens its menu or list, taps the item, waits until it is gone; returns the item's name */
async function pickAttr(p, id, key) {
  const button = p.getByTestId(`${id}-button`).locator("visible=true").first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const item = p.locator(`[data-testid="${id}-${key}"], [data-testid="${id}-picker-${key}"]`).locator("visible=true").first();
  await item.waitFor({ timeout: 5000 });
  const name = ((await item.getAttribute("aria-label")) || (await item.innerText())).trim();
  await item.click();
  await item.waitFor({ state: "hidden", timeout: 5000 });
  await attrShut(p, id);
  return name;
}

/** the open downspout's kind (its menu is open): a field on top (#2412 G1); `key` — rectPlain, rectRibbed, roundPlain, roundRibbed */
async function pickDsKind(p, key) {
  await p.getByTestId("attr-panel").locator("visible=true").first().waitFor({ timeout: 5000 });
  const name = await pickAttr(p, "attr-ds-kind", key);
  await p.waitForFunction((n) => {
    const b = [...document.querySelectorAll('[data-testid="attr-ds-kind-button"]')].find((e) => e.getClientRects().length > 0);
    return !!b && b.innerText.trim() === n;
  }, name, { timeout: 5000 });
}

// «Отменить» of a toast (v2, #2086): the word ignores a tap until it is armed (`aria-busy` false, motion.toastArmMs after the toast
// showed) — waits for that, then presses. A stack of up to three toasts, the NEWEST ON TOP (first in the page; the old
// `getByRole("button", { name: "Отменить" }).last()` took the oldest — «Уже не отменить» of another action). `text` — the newest toast
// with that text; none — the newest one.
async function pressUndo(p, text) {
  const all = p.getByTestId("toast").locator("visible=true");
  const toast = (text ? all.filter({ hasText: text }) : all).first();
  const undo = toast.getByTestId("toast-undo");
  await undo.waitFor({ timeout: 5000 });
  await p.waitForFunction((el) => el.getAttribute("aria-busy") !== "true", await undo.elementHandle(), { timeout: 5000 });
  await undo.click();
}

/**
 * The gutter / downspout window's own buttons (DS §7.3, #2412 PR3): «Сохранить» keeps its edits (as one step of «Назад»),
 * «Закрыть» closes it (with edits it asks «Сохранить изменения?» first). Waits until the window — and on 390 its sheet — has left.
 */
async function winSave(p) {
  await p.getByTestId("attr-win-save").locator("visible=true").first().getByRole("button").click();
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="attr-panel"]')].some((e) => e.getBoundingClientRect().height > 0), null, { timeout: 5000 });
  await sheetGone(p);
}
async function winClose(p) {
  await p.getByTestId("attr-win-close").locator("visible=true").first().getByRole("button").click();
}

module.exports = { winSave, winClose, pressUndo, pickDsKind, pickAttr, attrShown, attrKeys, attrChosen, attrClose, attrShut, openAttrMore, openDsMenu, openProps, fitAll, doubleTap, doubleTapUntil, pastDoubleTap, savedOnce, skipLength, closeDsMenu, canvasAt, sheetGone, openView, backToCanvas, viewTotal, pressWhenStill, stands };
