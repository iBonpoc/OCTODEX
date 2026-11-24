/**
 * e2e 526 — #2425: a price or a cost that is already there is typed over, not added to (every view; by testID, rule 19).
 * The founder on the iPhone typed «150» into a price that stood at «0.00» and got $1.50; a cost of «190» showed a loss.
 * The money fields of an open estimate row select their text on focus: a tap + typing replaces the old number.
 * (The browser types key by key here, like a finger; the iPhone itself is checked by hand — rule 27.)
 */
exports.run = async (h) => {
  const p = h.page;
  const vis = (sel) => p.locator(sel).locator("visible=true").first();
  const field = (pre) => vis(`[data-testid^="${pre}"]`).locator("input");
  const valueIs = (pre, v, what) =>
    p
      .waitForFunction(([s, want]) => document.querySelector(`[data-testid^="${s}"] input`)?.value === want, [pre, v], { timeout: 3000 })
      .then(
        () => {},
        async () => h.expect(false, `${what} (stands: «${await p.locator(`[data-testid^="${pre}"] input`).first().inputValue()}»)`),
      );

  await h.go("/estimate/new?customerId=c2&propertyId=p2");
  await vis('[data-testid="est-add-new"]').waitFor({ timeout: 8000 });
  await vis('[data-testid="est-add-new"]').getByRole("button").click();
  await field("est-name-").fill("Gutter");

  for (const [pre, first, typed, want] of [
    ["est-price-", "12.13", "150", "150.00"],
    ["est-cost-", "11.03", "190", "190.00"],
  ]) {
    // a number already stands in the field (as after the catalog, or a field shown as 0.00)
    await field(pre).fill(first);
    // the caret at the end before leaving: the browser keeps a field's last selection for its next focus, and `fill` leaves it
    // all selected — the select below must be the field's own, not one left over
    await field(pre).evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
    await field(pre).blur();
    await valueIs(pre, first, `${pre}: «${first}» stands`);
    // coming into the field and typing key by key, like a finger — the old number goes, the new one stays. Focus, not a mouse
    // click: on the web a click's mouse-up puts the caret back after the select (desktop behaviour); the phone selects by hand
    // after the tap (ui/fieldFocus) — checked on the iPhone, rule 27
    await field(pre).focus();
    // the field selects its text a moment after the focus — wait for exactly that (rule 19); a field that never selects fails here
    const selected = await p
      .waitForFunction(() => { const el = document.activeElement; return !!el && el.value !== "" && el.selectionStart === 0 && el.selectionEnd === el.value.length; }, null, { timeout: 2000 })
      .then(() => true, () => false);
    h.expect(selected, `${pre}: the old number is selected on focus (typing replaces it)`);
    await field(pre).pressSequentially(typed, { delay: 30 });
    await field(pre).blur();
    await valueIs(pre, want, `${pre}: typing «${typed}» over «${first}» gives ${want}, not a number glued to the old one`);
  }

  // #2469 (CI twice: «150» over a price gave «50.00»): a slow device — the select that comes a moment after the focus (the web's
  // `selectTextOnFocus`, the phone's select by hand) comes AFTER the first digit and selects it, the second digit replaces it. The
  // field is all selected the moment it takes the focus, and a late select never takes what was typed — not even a digit that left
  // the same text («1» over «1», then «2»: 12, not 2). A slow device is made here: every timer of 0 ms waits 15 ms (between the digits
  // typed 30 ms apart); the caret is put at the end before the focus — only the field's own select at the focus selects it
  for (const [pre, first, typed, want] of [["est-price-", "12.13", "150", "150.00"], ["est-cost-", "11.03", "190", "190.00"], ["est-qty-", "1", "12", "12"]]) {
    await field(pre).fill(first);
    await field(pre).evaluate((el) => el.setSelectionRange(el.value.length, el.value.length));
    await field(pre).blur();
    await valueIs(pre, first, `${pre}: «${first}» stands`);
    await p.evaluate(() => {
      const orig = window.setTimeout;
      window.__slowTimers = orig;
      window.setTimeout = (fn, ms, ...a) => orig(fn, ms ? ms : 15, ...a);
    });
    try {
      await field(pre).focus();
      await field(pre).pressSequentially(typed, { delay: 30 });
    } finally {
      await p.evaluate(() => { if (window.__slowTimers) window.setTimeout = window.__slowTimers; });
    }
    await field(pre).blur();
    await valueIs(pre, want, `${pre} (a slow device): typing «${typed}» right after the focus gives ${want} — the late select never takes the first digit`);
  }
};
