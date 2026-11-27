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
// «Править чертёж» (#2995): on the measurement's own screen it is in «⋯» (the object frame); the 1280 panel of «Замеры» keeps its button
async function editDrawing(p) {
  const btn = p.getByTestId("view-edit").locator("visible=true").first();
  if (await btn.count()) return pressWhenStill(btn.getByRole("button"));
  await pressWhenStill(p.getByTestId("view-more").locator("visible=true").first().getByRole("button"));
  await p.getByRole("menuitem", { name: "Править чертёж", exact: true }).click();
}
/** «Править чертёж» is offered (its button, or the item of «⋯» — the menu is opened and closed again) */
async function canEditDrawing(p) {
  if (await p.getByTestId("view-edit").locator("visible=true").count()) return true;
  await pressWhenStill(p.getByTestId("view-more").locator("visible=true").first().getByRole("button"));
  const item = p.getByRole("menuitem", { name: "Править чертёж", exact: true });
  const has = await item.waitFor({ timeout: 3000 }).then(() => true, () => false);
  await pressEscUntilClosed(p);
  return has;
}

async function backToCanvas(p) {
  await editDrawing(p);
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

/**
 * A field of tiles (the downspout's kind, the gutter's profile — founder 27.11, #2980 / #2986): no button, the tiles are `<id>-<key>`
 * radios. The helpers below read and pick them the same way as a menu field.
 */
async function isTiles(p, id) {
  return (await p.getByTestId(`${id}-button`).locator("visible=true").count()) === 0 && (await p.getByTestId(id).locator("visible=true").count()) > 0;
}
const tileSel = (id) => `[data-testid^="${id}-"][role="radio"]`;
async function tileIds(p, id) {
  return p.getByTestId(id).locator("visible=true").first().locator(tileSel(id)).evaluateAll((es) => es.map((e) => [e.getAttribute("data-testid"), e.getAttribute("aria-checked") === "true", e.getAttribute("aria-label") || e.innerText]));
}

/**
 * #3051 (founder 27.11: «проверь, чтобы плитки были одинаковые»): the tiles of a field are one width and one height (±1 px), and
 * none of their words is cut. Returns a line saying what is wrong, or "" when all is well.
 */
async function tilesEven(p, id) {
  return p.getByTestId(id).locator("visible=true").first().evaluate((root, x) => {
    const tiles = [...root.querySelectorAll(`[data-testid^="${x}-"][role="radio"]`)];
    if (tiles.length < 2) return `${x}: ${tiles.length} tile(s)`;
    const r = tiles.map((t) => t.getBoundingClientRect());
    const w = r.map((b) => Math.round(b.width)), h = r.map((b) => Math.round(b.height));
    const cut = tiles.filter((t) => [t, ...t.querySelectorAll("*")].some((n) => n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1)).map((t) => t.getAttribute("data-testid"));
    const bad = [];
    if (Math.max(...w) - Math.min(...w) > 1) bad.push(`widths ${w.join("/")}`);
    if (Math.max(...h) - Math.min(...h) > 1) bad.push(`heights ${h.join("/")}`);
    if (new Set(r.map((b) => Math.round(b.top))).size > 1) bad.push("not one row");
    if (cut.length) bad.push(`cut: ${cut.join(",")}`);
    return bad.length ? `${x}: ${bad.join("; ")}` : "";
  }, id);
}

/**
 * #3051: two fields in one row (Размер · Цвет, Низ · Верх, Материал · Толщина) stand side by side on one line, neither runs over the
 * other, and neither value is cut («…»). Returns a line saying what is wrong, or "".
 */
async function pairFits(p, a, b) {
  return p.evaluate(([x, y]) => {
    const btn = (id) => [...document.querySelectorAll(`[data-testid="${id}-button"]`)].find((e) => e.getClientRects().length > 0);
    const A = btn(x), B = btn(y);
    if (!A || !B) return `${x} · ${y}: a field is missing`;
    const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
    const cut = (e) => [e, ...e.querySelectorAll("*")].some((n) => n.scrollWidth > n.clientWidth + 1);
    const bad = [];
    if (Math.abs(ra.top - rb.top) > 1) bad.push("not one line");
    if (ra.right > rb.left + 0.5) bad.push("they overlap");
    if (cut(A)) bad.push(`${x} cut («${A.innerText.trim()}»)`);
    if (cut(B)) bad.push(`${y} cut («${B.innerText.trim()}»)`);
    return bad.length ? `${x} · ${y}: ${bad.join("; ")}` : "";
  }, [a, b]);
}

/** what a field shows (its button's text; a tile field — the chosen tile's name) */
async function attrShown(p, id) {
  if (await isTiles(p, id)) return ((await tileIds(p, id)).find((x) => x[1])?.[2] ?? "").replace(/\s+/g, " ").trim();
  return (await p.getByTestId(`${id}-button`).locator("visible=true").first().innerText()).trim();
}

/** the keys a field offers: opens its menu or list, reads the items, closes it (attrClose) */
async function attrKeys(p, id) {
  if (await isTiles(p, id)) return (await tileIds(p, id)).map((x) => x[0].slice(id.length + 1));
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
  if (await isTiles(p, id)) {
    const on = (await tileIds(p, id)).filter((x) => x[1]);
    return on.length === 1 ? on[0][0].slice(id.length + 1) : null;
  }
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
  if (await isTiles(p, id)) return; // tiles open nothing
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
  if (await isTiles(p, id)) {
    const tile = p.getByTestId(id).locator("visible=true").first().locator(`[data-testid="${id}-${key}"]`);
    await tile.scrollIntoViewIfNeeded();
    const name = ((await tile.getAttribute("aria-label")) || (await tile.innerText())).replace(/\s+/g, " ").trim();
    await tile.click();
    await p.waitForFunction(([x, k]) => [...document.querySelectorAll(`[data-testid="${x}-${k}"]`)].some((e) => e.getClientRects().length > 0 && e.getAttribute("aria-checked") === "true"), [id, key], { timeout: 5000 });
    return name;
  }
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
  await pickAttr(p, "attr-ds-kind", key); // tiles (#2980): pickAttr waits until the tile is checked
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

// «Документы бригады» (#2989): the cut and the shop drawings left the card's «Документы» — they are in «⋯ → Документы бригады». `docsFor` makes
// the button `id` reachable: the crew's ones — that sheet open; the card's own («Чертёж», «Заказ материалов») — that sheet closed
const shownNow = (p, id) => p.evaluate((x) => [...document.querySelectorAll(`[data-testid="${x}"]`)].some((e) => e.getClientRects().length > 0), id);
// #3028: the measurement's own screen has sections — «Документы» stand on «Сметы», the photos on «Фото», the drawing and the parts on «Обзор».
// A section is opened when what is asked for is not on the screen (the 1280 panel has no sections: nothing to press there)
async function showSection(p, id) {
  // the screen may still be coming in: wait until the thing asked for or the measurement's frame is there
  await p.waitForFunction((x) => [...document.querySelectorAll(`[data-testid="${x}"], [data-testid="view-head"], [data-testid="list-panel"]`)].some((e) => e.getClientRects().length > 0), id, { timeout: 8000 }).catch(() => {});
  if (await shownNow(p, id)) return;
  const name = /^view-(docs|doc-|pdf-|estimates)/.test(id) ? /^Сметы/ : /^view-photo/.test(id) ? /^Фото/ : /^view-hist/.test(id) ? /^История/ : /^Обзор/;
  const tab = p.getByRole("tab", { name }).locator("visible=true").first();
  // the bottom bar's tabs are tabs too: wait for the section's own one a moment (none on the 1280 panel — then nothing to press)
  await tab.waitFor({ timeout: 4000 }).catch(() => {});
  if (!(await tab.count())) return;
  // a screen sliding in drops a press on a moving tab: pressed when it stands, once more if the section did not come
  for (let i = 0; i < 3; i++) {
    await stands(tab);
    await tab.click();
    const ok = await p.waitForFunction((x) => [...document.querySelectorAll(`[data-testid="${x}"]`)].some((e) => e.getClientRects().length > 0), id, { timeout: 2500 }).then(() => true, () => false);
    if (ok) return;
  }
}
async function docsFor(p, id) {
  const crew = /^view-(pdf|doc)-(crew|shop)$/.test(id);
  const open = await shownNow(p, "view-crew-docs");
  if (crew && !open) {
    await p.getByTestId("view-more").locator("visible=true").first().getByRole("button").click();
    await p.getByRole("menuitem", { name: "Документы бригады", exact: true }).click();
    await p.getByTestId("view-crew-docs").locator("visible=true").first().waitFor({ timeout: 5000 });
  } else if (!crew && open) {
    await pressEscUntilClosed(p);
    await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="view-crew-docs"]')].some((e) => e.getClientRects().length > 0), null, { timeout: 5000 });
  }
  if (!crew) await showSection(p, id);
}

/** #3027: a lead with nothing open of its own — its «Готово» makes a NEW estimate (a lead with an open one gets the drawing in it, e2e 556) */
function freeLead(d) {
  const free = (l) => !d.estimates.some((e) => e.status !== "declined" && ((e.leadId && e.leadId === l.id) || (l.propertyId && e.propertyId === l.propertyId)));
  return d.leads.find((l) => free(l) && l.propertyId && !["won", "lost", "declined"].includes(l.status)) || d.leads.find((l) => free(l) && !["won", "lost", "declined"].includes(l.status));
}

/**
 * #3027 (founder 26.11, #3047 А): after «Готово» the estimate comes by itself — its id, waited for in the phone's data; `edit` — then into
 * the estimate's editor, where «Сделать смету» used to go.
 */
async function autoEstimateOf(p, mid, edit = true) {
  const id = await p.waitForFunction((m) => {
    const d = (JSON.parse(localStorage.getItem("octo.db.v5") || "null") || {}).db;
    const e = (d?.estimates || []).find((x) => (x.doc?.options || []).some((o) => o.lines.some((l) => l.source && l.source.module === "gutters" && l.source.measurementId === m)));
    return e ? e.id : null;
  }, mid, { timeout: 8000 }).then((h) => h.jsonValue());
  if (edit) {
    await p.goto(new URL(`/estimate/new?id=${encodeURIComponent(id)}`, p.url()).toString());
    await p.waitForURL(/\/estimate\/new\?id=/, { timeout: 8000 });
  }
  return id;
}

module.exports = { freeLead, autoEstimateOf, tilesEven, pairFits, showSection, editDrawing, canEditDrawing, docsFor, winSave, winClose, pressUndo, pickDsKind, pickAttr, attrShown, attrKeys, attrChosen, attrClose, attrShut, openAttrMore, openDsMenu, openProps, fitAll, doubleTap, doubleTapUntil, pastDoubleTap, savedOnce, skipLength, closeDsMenu, canvasAt, sheetGone, openView, backToCanvas, viewTotal, pressWhenStill, stands };
