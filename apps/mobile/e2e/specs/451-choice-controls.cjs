/**
 * Choice controls of wave 1а (DS §9, spec 56; showcase «Выбор»: Настройки → Дизайн-система → «Выбор»), every view:
 * - OptionRow: a tap chooses one (radio, aria-checked, the mark on the right); ↓ and Space on the web; several — option + aria-selected;
 * - OptionTile: a tile chooses (the mark in the corner); the action tile is a button with no mark, 12 from the choice, all tiles one width;
 * - ToggleRow: a tap on the label (the whole row) flips the switch, the field it turns on shows under it; disabled does not flip;
 * - PctUsdField: «% | $» changes the unit, the switch is 44 high and each item ≥ 44 wide, in dollars the field ends with «/ hr»;
 *   the $ → % question card with its two buttons;
 * - MultiValueField: «⊕ Добавить телефон» adds a row, the label menu changes the label, «⊖» removes a row with «Отменить»;
 * - DoneCircle: checkbox + checked flips; FracKeys: eight keys in one line (one top) at every width, a key types its fraction.
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (id) => p.getByTestId(id).locator("visible=true").first();
  const attr = (id, name, value) =>
    p
      .waitForFunction(
        ([id, name, value]) => [...document.querySelectorAll(`[data-testid="${id}"]`)].some((e) => e.offsetParent !== null && e.getAttribute(name) === value),
        [id, name, value],
        { timeout: 3000 },
      )
      .catch(async () => {
        const seen = await p.evaluate(([id, name]) => [...document.querySelectorAll(`[data-testid="${id}"]`)].map((e) => `${e.getAttribute("role")}:${e.getAttribute(name)}`).join(" "), [id, name]);
        throw new Error(`expect failed: ${id} ${name}=${value} (seen ${seen || "nothing"})`);
      });
  const box = async (id) => {
    const b = await vis(id).boundingBox();
    if (!b) throw new Error(`no box for ${id}`);
    return b;
  };
  await h.go("/settings/design-system/choice");
  await vis("showcase-choice").waitFor({ timeout: 5000 });

  // OptionRow — one: radio, a tap chooses, the mark moves with it
  const row = (k) => `showcase-option-row-${k}`;
  h.expect((await vis(row("crew")).getAttribute("role")) === "radio", "OptionRow: a row of one is a radio");
  h.expect((await p.locator('[data-testid="showcase-option-row"][role="radiogroup"]').count()) >= 1, "OptionRow: the group is a radiogroup");
  await attr(row("crew"), "aria-checked", "true");
  await vis(row("crew-check")).waitFor({ timeout: 3000 });
  await vis(row("me")).click();
  await attr(row("me"), "aria-checked", "true");
  await attr(row("crew"), "aria-checked", "false");
  h.expect(/Мне/.test(await vis("showcase-option-row-picked").innerText()), "OptionRow: the tap reports the chosen row");
  h.expect((await p.getByTestId(row("crew-check")).count()) === 0, "OptionRow: the mark left the row that is no longer chosen");
  const meBox = await box(row("me"));
  const crewBox = await box(row("crew"));
  h.expect(meBox.height >= 44 && crewBox.height >= 44, `OptionRow: rows ≥ 44 (${meBox.height}, ${crewBox.height})`);
  // web keys: ↓ moves the focus, Space chooses
  await vis(row("me")).focus();
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("ArrowDown");
  await p.keyboard.press("Space");
  await attr(row("nobody"), "aria-checked", "true");
  // several: option + aria-selected, a tap adds and takes away
  const multi = (k) => `showcase-option-multi-${k}`;
  h.expect((await vis(multi("vip")).getAttribute("role")) === "option", "OptionRow multiple: a row is an option");
  h.expect((await p.locator('[data-testid="showcase-option-multi"][role="listbox"][aria-multiselectable="true"]').count()) >= 1, "OptionRow multiple: a multiselectable listbox");
  await vis(multi("warranty")).click();
  await attr(multi("warranty"), "aria-selected", "true");
  await attr(multi("vip"), "aria-selected", "true");
  await vis(multi("vip")).click();
  await attr(multi("vip"), "aria-selected", "false");
  h.expect(/Выбрано 1/.test(await vis("showcase-option-multi-count").innerText()), "OptionRow multiple: one chosen after two taps");

  // OptionTile: the choice and the action
  const tile = (k) => `showcase-option-tile-${k}`;
  await vis(tile("out-check")).waitFor({ timeout: 3000 });
  await vis(tile("in")).click();
  await attr(tile("in"), "aria-checked", "true");
  await vis(tile("in-check")).waitFor({ timeout: 3000 });
  h.expect((await vis(tile("action")).getAttribute("role")) === "button", "OptionTile: the action is a button");
  h.expect((await p.getByTestId(tile("action-check")).count()) === 0, "OptionTile: the action tile carries no mark");
  const [tOut, tIn, tAct] = [await box(tile("out")), await box(tile("in")), await box(tile("action"))];
  h.expect(Math.abs(tOut.width - tIn.width) <= 1 && Math.abs(tIn.width - tAct.width) <= 1, `OptionTile: one width (${tOut.width}, ${tIn.width}, ${tAct.width})`);
  h.expect(Math.abs(tOut.y - tAct.y) <= 1 && tOut.height >= 70, `OptionTile: one row, ≈ 76 tall (${tOut.height})`);
  const gapChoice = tIn.x - (tOut.x + tOut.width);
  const gapAction = tAct.x - (tIn.x + tIn.width);
  h.expect(gapAction > gapChoice + 2, `OptionTile: the action stands further (${gapAction}) than the choice tiles (${gapChoice})`);
  h.expect(tOut.width <= 121, `OptionTile: a tile stops at maxW 120 (${tOut.width})`);
  await vis(tile("divider")).waitFor({ timeout: 3000 });
  const card = await vis("showcase-option-tile").boundingBox();
  h.expect(Math.abs(tOut.x - card.x) <= 1, "OptionTile: the row starts at the left");
  for (const id of ["showcase-pct-usd", "showcase-multi-value"]) {
    const b = await box(id);
    h.expect(b.width <= 561, `${id}: not wider than formMax 560 (${b.width})`);
  }
  await vis(tile("action")).click();
  await vis("showcase-option-tile-unlinked").waitFor({ timeout: 3000 });
  h.expect((await p.getByTestId(tile("in-check")).count()) === 0, "OptionTile: after the action no tile is chosen");

  // ToggleRow: the whole row flips — a tap on its words
  await attr("showcase-toggle-row", "aria-checked", "false");
  h.expect((await p.getByTestId("showcase-toggle-row-more").count()) === 0, "ToggleRow: the field it turns on is hidden while off");
  await vis("showcase-toggle-row").getByText("Счета на другой адрес", { exact: true }).click();
  await attr("showcase-toggle-row", "aria-checked", "true");
  await vis("showcase-toggle-row-street").waitFor({ timeout: 3000 });
  const trow = await box("showcase-toggle-row");
  h.expect(trow.height >= 44, `ToggleRow: the row ≥ 44 (${trow.height})`);
  h.expect((await vis("showcase-toggle-row").getAttribute("role")) === "switch", "ToggleRow: the row is the switch");
  await vis("showcase-toggle-row").click();
  await attr("showcase-toggle-row", "aria-checked", "false");
  await vis("showcase-toggle-disabled").click({ force: true });
  await attr("showcase-toggle-disabled", "aria-checked", "true");

  // PctUsdField: the unit, the switch size, «/ hr» in dollars, the $ → % question
  const seg = await box("showcase-pct-usd-unit");
  const fld = await box("showcase-pct-usd-field");
  h.expect(Math.abs(seg.height - fld.height) <= 2 && Math.abs(seg.y + seg.height - (fld.y + fld.height)) <= 2, `PctUsdField: the switch is level with the field (${seg.height} vs ${fld.height})`);
  if (h.layout.width < 820) h.expect(seg.height >= 44, `PctUsdField: on a phone the switch is 44 high (${seg.height})`);
  for (const u of ["pct", "usd"]) {
    const b = await box(`showcase-pct-usd-unit-${u}`);
    h.expect(b.width >= 44, `PctUsdField: «${u}» ≥ 44 wide (${b.width})`);
  }
  h.expect((await p.locator('[data-testid="showcase-pct-usd-unit"][role="radiogroup"][aria-label="Единица наценки"]').count()) >= 1, "PctUsdField: a radiogroup «Единица наценки»");
  await attr("showcase-pct-usd-unit-pct", "aria-checked", "true");
  await vis("showcase-pct-usd-unit-usd").click();
  await attr("showcase-pct-usd-unit-usd", "aria-checked", "true");
  await attr("showcase-pct-usd-unit-pct", "aria-checked", "false");
  h.expect(/\/ hr/.test(await vis("showcase-pct-usd-field").innerText()), "PctUsdField: in dollars the field ends with «/ hr»");
  h.expect(/= 40 %/.test(await vis("showcase-pct-usd-second").innerText()), "PctUsdField: the other value under / beside the field");
  await vis("showcase-pct-usd-ask").click();
  await vis("showcase-pct-usd-inexact").waitFor({ timeout: 3000 });
  h.expect(/на 1 ¢ больше/.test(await vis("showcase-pct-usd-inexact").innerText()), "PctUsdField: the card names the cent");
  await vis("showcase-pct-usd-to-pct").click();
  await attr("showcase-pct-usd-unit-pct", "aria-checked", "true");
  h.expect((await p.getByTestId("showcase-pct-usd-inexact").count()) === 0, "PctUsdField: «Перейти на %» closes the card");

  // MultiValueField: add, label, remove with «Отменить»
  const rows = () => p.evaluate(() => [...document.querySelectorAll('[data-testid^="showcase-multi-value-row-"]')].filter((e) => /^showcase-multi-value-row-\d+$/.test(e.getAttribute("data-testid")) && e.offsetParent !== null).length);
  h.expect((await rows()) === 1, "MultiValueField: one number to start");
  await vis("showcase-multi-value-add").click();
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="showcase-multi-value-row-1"]')].some((e) => e.offsetParent !== null), null, { timeout: 3000 });
  h.expect((await rows()) === 2, "MultiValueField: «⊕ Добавить телефон» adds a row");
  await vis("showcase-multi-value-row-0-label").click();
  await vis("showcase-multi-value-row-0-label-home").click();
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="showcase-multi-value-row-0-label"]')].some((e) => e.offsetParent !== null && /Домашний/.test(e.innerText)), null, { timeout: 3000 });
  const minus = await box("showcase-multi-value-row-1-remove");
  h.expect(minus.height >= 44, `MultiValueField: «⊖» zone ≥ 44 (${minus.height})`);
  await vis("showcase-multi-value-row-1-remove").click();
  await p.waitForFunction(() => ![...document.querySelectorAll('[data-testid="showcase-multi-value-row-1"]')].some((e) => e.offsetParent !== null), null, { timeout: 3000 });
  h.expect((await rows()) === 1, "MultiValueField: «⊖» removes the row");
  await h.expectText(/Номер удалён/, "MultiValueField: the toast offers to undo");

  // DoneCircle: a checkbox with checked
  h.expect((await vis("showcase-done-b").getAttribute("role")) === "checkbox", "DoneCircle: role checkbox");
  await attr("showcase-done-b", "aria-checked", "false");
  await vis("showcase-done-b").click();
  await attr("showcase-done-b", "aria-checked", "true");

  // FracKeys: eight keys in one line, a key types its fraction
  const keys = ["0", "1-8", "1-4", "3-8", "1-2", "5-8", "3-4", "7-8"];
  const tops = [];
  for (const k of keys) {
    const b = await box(`showcase-frac-keys-${k}`);
    tops.push(Math.round(b.y));
    h.expect((await vis(`showcase-frac-keys-${k}`).getAttribute("role")) === "button", `FracKeys: «${k}» is a button`);
  }
  h.expect(new Set(tops).size === 1, `FracKeys: one line at ${h.layout.width} (tops ${tops.join(", ")})`);
  await vis("showcase-frac-keys-5-8").click();
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="showcase-frac-typed"]')].some((e) => e.offsetParent !== null && /6 5\/8 in/.test(e.innerText)), null, { timeout: 3000 });

  // no horizontal overflow of the page
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  h.expect(over <= 1, `no sideways scroll (${over})`);
};
