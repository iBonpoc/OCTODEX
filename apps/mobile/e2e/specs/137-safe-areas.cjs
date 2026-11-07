/**
 * Spec 32 (founder 07.11): nothing goes under the notch / Dynamic Island, the home indicator or the rounded corners —
 * portrait and landscape, phone, tablet, desktop. Chromium has no notch: the insets are substituted on the element
 * react-native-safe-area-context measures env(safe-area-inset-*) with (the same trick as e2e 38, all four sides).
 * Windows per view (top/bottom/left/right):
 * - 390: an iPhone in portrait 390×844 (59/34/0/0), then the same phone in landscape 812×375 (0/21/44/44, phone layout);
 * - 820: an iPhone Pro Max in landscape 844×390 (0/21/59/59, tablet layout: the side menu and its drawer);
 * - 1280: an iPad / Mac window 1280×900 (24/20/0/0).
 * On «Главная», «План», «Клиенты», in the «＋» sheet, the menu and the full-screen signature: every visible button,
 * tab, field and text lies in the safe rectangle (sideways always; up and down — what does not scroll:
 * the tab bar, «＋», the side menu, sheets, the signature; the scrolling content at its top).
 */
const CASES = {
  390: [
    { w: 390, h: 844, t: 59, b: 34, l: 0, r: 0, name: "portrait" },
    { w: 812, h: 375, t: 0, b: 21, l: 44, r: 44, name: "landscape" },
  ],
  820: [{ w: 844, h: 390, t: 0, b: 21, l: 59, r: 59, name: "landscape" }],
  1280: [{ w: 1280, h: 900, t: 24, b: 20, l: 0, r: 0, name: "ipad" }],
};

/** the insets on the measuring element; a resize makes the provider read them again */
async function insets(page, c) {
  await page.evaluate((c) => {
    let s = document.getElementById("e2e-safe-area");
    if (!s) {
      s = document.createElement("style");
      s.id = "e2e-safe-area";
      document.head.appendChild(s);
    }
    s.textContent = `body > div[style*="z-index: -1"]{padding:${c.t}px ${c.r}px ${c.b}px ${c.l}px!important}`;
  }, c);
  await page.setViewportSize({ width: c.w + 1, height: c.h });
  await page.waitForTimeout(250);
  await page.setViewportSize({ width: c.w, height: c.h });
  await page.waitForTimeout(700);
}

/**
 * What lies outside the safe rectangle. `scope`: a selector (a sheet, the signature) — only inside it, and up/down too;
 * none — the whole screen: sideways everything, up/down the fixed parts and what is at the top of the scroll.
 */
const offenders = (page, c, scope) =>
  page.evaluate(
    ({ c, scope }) => {
      const W = window.innerWidth, H = window.innerHeight;
      const safe = { l: c.l, t: c.t, r: W - c.r, b: H - c.b };
      const roots = scope ? [...document.querySelectorAll(scope)] : [document.getElementById("root")];
      const fixed = ['[data-testid="tab-bar"]', '[data-testid="fab"]', '[data-testid="side-nav"]', '[aria-modal="true"]', '[role="dialog"]', '[data-testid="sig-full"]'];
      const shown = (e) => {
        for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
          const st = getComputedStyle(n);
          if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
        }
        return true;
      };
      // a sideways scroller (a row of chips) runs to the edge on purpose: it scrolls
      const inHScroll = (e) => {
        for (let n = e.parentElement; n; n = n.parentElement) {
          const st = getComputedStyle(n);
          if (/(auto|scroll)/.test(st.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
        }
        return false;
      };
      const out = [];
      /** the part a scroller (or any clipping box) leaves visible: what is scrolled away is not on screen */
      const visible = (b, el) => {
        let { left, top, right, bottom } = b;
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const st = getComputedStyle(n);
          if (st.overflowX === "visible" && st.overflowY === "visible") continue;
          const r = n.getBoundingClientRect();
          if (st.overflowX !== "visible") (left = Math.max(left, r.left)), (right = Math.min(right, r.right));
          if (st.overflowY !== "visible") (top = Math.max(top, r.top)), (bottom = Math.min(bottom, r.bottom));
        }
        return { left, top, right, bottom, width: right - left, height: bottom - top };
      };
      const check = (raw, what, el) => {
        // the scrim behind a sheet («Закрыть» on the whole screen) covers the edges on purpose
        if (raw.width >= W - 1 && raw.height >= H - 1) return;
        const b = visible(raw, el);
        if (b.width < 1 || b.height < 1) return;
        if (b.bottom <= 0 || b.top >= H || b.right <= 0 || b.left >= W) return; // off screen
        if (inHScroll(el)) return;
        const isFixed = scope || fixed.some((s) => el.closest(s));
        const bad = [];
        if (b.left < safe.l - 0.5) bad.push(`left ${Math.round(b.left)} < ${safe.l}`);
        if (b.right > safe.r + 0.5) bad.push(`right ${Math.round(b.right)} > ${safe.r}`);
        if (b.top < safe.t - 0.5 && (isFixed || window.scrollY === 0)) bad.push(`top ${Math.round(b.top)} < ${safe.t}`);
        if (isFixed && b.bottom > safe.b + 0.5) bad.push(`bottom ${Math.round(b.bottom)} > ${safe.b}`);
        if (bad.length) out.push(`${what}: ${bad.join(", ")}`);
      };
      const sel = '[role="button"],[role="tab"],[role="link"],[role="switch"],[role="checkbox"],a,button,input,textarea';
      for (const root of roots) {
        for (const e of root.querySelectorAll(sel)) {
          if (!shown(e)) continue;
          check(e.getBoundingClientRect(), `${e.getAttribute("data-testid") || e.getAttribute("aria-label") || e.tagName} (button)`, e);
        }
        const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) {
          const s = n.textContent.trim();
          if (!s || !n.parentElement || !shown(n.parentElement)) continue;
          const r = document.createRange();
          r.selectNodeContents(n);
          for (const b of r.getClientRects()) check(b, `«${s.slice(0, 24)}»`, n.parentElement);
        }
        if (scope) for (const e of root.querySelectorAll("[aria-label]")) if (e.closest('[data-testid="sig-full"]') && shown(e)) check(e.getBoundingClientRect(), `${e.getAttribute("aria-label")} (canvas)`, e);
      }
      return [...new Set(out)].slice(0, 8);
    },
    { c, scope },
  );

/** every place is checked before the run fails: the report lists all of them */
async function clear(h, c, what, scope) {
  const bad = await offenders(h.page, c, scope);
  if (bad.length) h.failures.push(`${c.name} ${c.w}×${c.h}: ${what} in the safe area — ${bad.join("; ")}`);
}

exports.run = async (h) => {
  const p = h.page;
  h.failures = [];
  for (const c of CASES[h.layout.width]) {
    await p.setViewportSize({ width: c.w, height: c.h });
    const wide = c.w >= 820;
    for (const [path, name] of [["/", "Главная"], ["/plan", "План"], ["/clients", "Клиенты"]]) {
      await h.go(path);
      await insets(p, c);
      await clear(h, c, name);
      // the fixed parts are there to check
      if (wide) h.expect(await p.getByTestId("side-nav").isVisible(), `${c.name}: the side menu shown`);
      else h.expect(await p.getByTestId("tab-bar").first().isVisible(), `${c.name}: the tab bar shown`);
    }
    await h.shot(`${c.name}-clients`);

    // «＋» on «Главная» (on «Клиенты» it opens the new client at once): the floating button (phone) or the header one → its sheet
    await h.go("/");
    await insets(p, c);
    const fab = p.locator(wide ? '[data-testid="fab-header"]' : '[data-testid="fab"]').locator("visible=true").first();
    await fab.click();
    await h.sheet().waitFor({ timeout: 3000 });
    await p.waitForTimeout(300);
    await clear(h, c, "the «＋» sheet", '[aria-modal="true"]');
    await h.shot(`${c.name}-create`);
    await p.keyboard.press("Escape");
    await p.waitForTimeout(400);

    // the menu: the phone has the «Ещё» tab (a screen); 820 — ☰ opens the drawer; 1280 — the side menu opens in place
    if (!wide) {
      await h.go("/more");
      await insets(p, c);
      await clear(h, c, "«Ещё»");
    } else {
      await h.go("/clients");
      await insets(p, c);
      await p.getByTestId("side-toggle").click();
      await p.waitForTimeout(500);
      const drawer = await p.getByRole("dialog", { name: "Меню" }).count();
      await clear(h, c, "the menu", drawer ? '[role="dialog"]' : '[data-testid="side-nav"]');
      await h.shot(`${c.name}-menu`);
      if (!drawer) await p.getByTestId("side-toggle").click();
    }

    // the full-screen signature (phone only: 820/1280 have no «Развернуть»)
    if (!wide) {
      await h.go("/p/demo0handyman0estimate0000000001");
      await insets(p, c);
      await p.getByPlaceholder(/Ваше имя|Your name/).last().fill("Linda Alvarez");
      await p.getByRole("switch", { name: /E-SIGN/ }).last().click();
      const expand = p.getByRole("button", { name: /^(Развернуть на весь экран|Full screen|Pantalla completa)$/ }).last();
      await expand.scrollIntoViewIfNeeded();
      await expand.click();
      await p.locator('[data-testid="sig-full"]').waitFor({ timeout: 3000 });
      await p.waitForTimeout(400);
      await clear(h, c, "the full-screen signature", '[data-testid="sig-full"]');
      await h.shot(`${c.name}-signature`);
    }
  }
  if (h.failures.length) console.log(h.failures.join("\n"));
  h.expect(h.failures.length === 0, `\n${h.failures.join("\n")}`);
};
