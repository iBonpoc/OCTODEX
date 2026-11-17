/**
 * e2e 457 — #1427 «Тексты экранов», обрезка (DS §4.3: смысл и имена не обрезаются; §12.2: «…» — только в шапке), every view, by testID:
 * - 030: the estimate editor «Кратко» — every line name is whole (wraps, no «…»), its sum beside it is whole too;
 * - 082: «Своё направление» — the placeholder fits its field, «＋ Добавить» does not overlap the field;
 * - 084: the trail to the app settings says «Настройки», whole; the settings title is whole;
 * - 088: the terms gate title «Условия» is whole;
 * - 061, 085: the showcase sections' captions and «Удалить учётную запись» under «Профиль и аккаунт» wrap, whole.
 * «Cut» = the text is wider than its box (one line with «…») or a line is hidden under its box (a clamp of N lines).
 */
const NAMES = {
  "l-e6-1": "Debris haul-away (pickup load)",
  "l-e6-4": "Replace light bulb / fixture lamp",
  "l-e6-2": "Carpet removal",
};

exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  /** every element with its own text inside the test id: nothing is cut (no hidden width or height, no «…» clip) */
  const cut = async (id) => {
    await tid(id).waitFor({ timeout: 8000 });
    await tid(id).scrollIntoViewIfNeeded();
    return tid(id).evaluate((root) => {
      const els = [root, ...root.querySelectorAll("*")].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
      return els
        .map((e) => {
          const s = getComputedStyle(e);
          // a hidden line is a whole line high; a glyph of the display font may stick out by a few pixels (not a cut)
          const line = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
          // one line with «…»: a single pixel over is already cut
          const slack = s.textOverflow === "ellipsis" ? 0 : 1;
          const clipped = e.scrollWidth > e.clientWidth + slack || e.scrollHeight > e.clientHeight + line / 2;
          return clipped ? `«${e.textContent}» ${e.scrollWidth}×${e.scrollHeight} in ${e.clientWidth}×${e.clientHeight}` : "";
        })
        .filter(Boolean)
        .join("; ");
    });
  };
  const whole = async (id, text, what) => {
    const c = await cut(id);
    h.expect(!c, `${what}: not cut (${c})`);
    if (text !== undefined) {
      const seen = (await tid(id).innerText()).replace(/\s+/g, " ").trim();
      h.expect(seen === text, `${what}: «${text}», seen «${seen}»`);
    }
  };

  // 030: the estimate editor, «Кратко» (the default): the names wrap, the sums keep their width
  await h.go("/estimate/new?id=e6");
  for (const [id, name] of Object.entries(NAMES)) {
    await whole(`est-title-${id}`, name, `030 line name ${id}`);
    await whole(`est-sum-${id}`, undefined, `030 line sum ${id}`);
  }

  // 082: «Направления работ» — «Своё направление»: the placeholder fits, the button stands clear of the field
  await h.go("/company/trades");
  await tid("dir-own").scrollIntoViewIfNeeded();
  const input = p.locator('[data-testid="dir-own"] input').locator("visible=true").first();
  const fits = await input.evaluate((e) => {
    const s = getComputedStyle(e);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const room = e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
    return { text: e.placeholder, need: Math.ceil(ctx.measureText(e.placeholder).width), room };
  });
  h.expect(fits.need <= fits.room, `082 placeholder «${fits.text}» fits: needs ${fits.need}, field has ${fits.room}`);
  const a = await input.boundingBox();
  const b = await tid("dir-add").boundingBox();
  h.expect(a && b, "082 the field and «＋ Добавить» are on screen");
  const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  h.expect(!overlap, `082 «＋ Добавить» does not overlap the field (field ${JSON.stringify(a)}, button ${JSON.stringify(b)})`);

  // 084: the settings title, and the trail back to them from a showcase section
  await h.go("/settings");
  await whole("screen-title", undefined, "084 settings title");
  await h.go("/settings/design-system/base");
  await whole("crumb-/settings", "Настройки", "084 the trail «Настройки»");

  // 061: the showcase sections' captions wrap
  await h.go("/settings/design-system");
  for (const id of ["base", "buttons", "selectors", "windows", "notices", "motion", "choice", "fields", "rows", "haptics", "spacing", "brand"]) await whole(`showcase-row-${id}`, undefined, `061 showcase row ${id}`);
  // 085: «Профиль и аккаунт» — the delete row's caption wraps
  await h.go("/settings/profile");
  await whole("acct-row", undefined, "085 the account row");

  // 088: the terms gate
  await h.go("/auth/terms");
  await whole("screen-title", "Условия", "088 terms title");
  await h.shot(1);
};
