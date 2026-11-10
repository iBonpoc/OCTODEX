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
const { pressEscUntilClosed, waited } = require("../sheet.cjs");
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
  await page.waitForFunction((w) => window.innerWidth === w, c.w + 1);
  await page.setViewportSize({ width: c.w, height: c.h });
  await applied(page, c);
}

/**
 * Wait until the app has drawn with the new insets — on what shows them: the signature's padding, the side menu's
 * left padding (the notch), the tab bar's distance from the bottom. Not seen in time: the check below says what is wrong.
 */
const applied = (page, c) =>
  waited(
    page.waitForFunction(
      (c) => {
        if (window.innerWidth !== c.w) return false;
        // the layout holds still (the insets are read after a short CSS transition; a sheet opening): the same edges
        // three polls running
        const key = [...document.querySelectorAll('[role="button"],[data-testid="sig-full"]')]
          .slice(0, 40)
          .map((e) => { const b = e.getBoundingClientRect(); return `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)}`; })
          .join(";");
        const st = (window.__e2eStable = window.__e2eStable && window.__e2eStable.key === key ? { key, n: window.__e2eStable.n + 1 } : { key, n: 0 });
        if (st.n < 3) return false;
        const px = (e, k) => parseFloat(getComputedStyle(e)[k]);
        const sig = document.querySelector('[data-testid="sig-full"]');
        if (sig) return Math.abs(px(sig, "paddingLeft") - Math.max(c.l, 16)) < 0.5 && Math.abs(px(sig, "paddingTop") - Math.max(c.t, 16)) < 0.5;
        const nav = document.querySelector('[data-testid="side-nav"]');
        if (nav) return Math.abs(px(nav, "paddingLeft") - c.l) < 0.5 && Math.abs(px(nav, "paddingTop") - (c.t + 12)) < 0.5;
        const bar = [...document.querySelectorAll('[data-testid="tab-bar"]')].map((e) => e.getBoundingClientRect()).find((b) => b.height > 0);
        if (bar) return bar.bottom <= window.innerHeight - Math.max(c.b, 12) + 0.5 && bar.bottom >= window.innerHeight - Math.max(c.b, 12) - 12;
        return true; // a page without them (the client page): the resize is all
      },
      c,
      { timeout: 3000 },
    ),
  );

/**
 * The left edge of the screen's content: 16 after the side menu (820/1280 — not the notch again), max(notch, 16) on a
 * phone. The leftmost thing on the screen (a card, a button, the version line) lies on that edge.
 */
const contentLeft = (page) =>
  page.evaluate(() => {
    const nav = document.querySelector('[data-testid="side-nav"]');
    const skip = '[data-testid="side-nav"],[data-testid="tab-bar"],[data-testid="fab"],[aria-modal="true"]';
    const inHScroll = (e) => {
      for (let n = e.parentElement; n; n = n.parentElement) {
        const st = getComputedStyle(n);
        if (/(auto|scroll)/.test(st.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
      }
      return false;
    };
    let left = Infinity;
    for (const e of document.getElementById("root").querySelectorAll('[role="button"],button,a,input')) {
      if (e.closest(skip) || inHScroll(e)) continue;
      const b = e.getBoundingClientRect();
      if (b.width < 1 || b.height < 1 || b.bottom <= 0 || b.top >= window.innerHeight) continue;
      left = Math.min(left, b.left);
    }
    return { left, nav: nav ? nav.getBoundingClientRect().right : null };
  });

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
      // no double padding: after the side menu the content starts 16 from it, the notch is the menu's (useNavInsets)
      const cl = await contentLeft(p);
      const want = wide ? cl.nav + 16 : Math.max(c.l, 16);
      if (wide && cl.nav === null) h.failures.push(`${c.name} ${name}: no side menu`);
      else if (Math.abs(cl.left - want) > 1) h.failures.push(`${c.name} ${c.w}×${c.h}: ${name} — the content starts at ${Math.round(cl.left)}, not ${want}`);
      // the fixed parts are there to check
      if (wide) h.expect(await p.getByTestId("side-nav").isVisible(), `${c.name}: the side menu shown`);
      else h.expect(await p.getByTestId("tab-bar").first().isVisible(), `${c.name}: the tab bar shown`);
    }
    await h.shot(`${c.name}-clients`);

    // the status bar backdrop (spec 32 §7): scrolled, the list passes under the clock on glass, not bare;
    // at the top of the scroll nothing is drawn there
    if (c.t > 0 && !wide) {
      const backdrop = () => p.evaluate(() => { const e = [...document.querySelectorAll('[data-testid="status-backdrop"]')].find((x) => x.getBoundingClientRect().height > 0); return e ? e.getBoundingClientRect().height : 0; });
      h.expect((await backdrop()) === 0, `${c.name}: no backdrop at the top of the scroll`);
      await p.mouse.move(c.w / 2, c.h / 2);
      await p.mouse.wheel(0, 300);
      await p.waitForFunction(() => [...document.querySelectorAll("div")].some((d) => d.scrollTop > 100), null, { timeout: 3000 });
      await applied(p, c);
      await h.shot(`${c.name}-scrolled`);
      const bh = await backdrop();
      if (Math.abs(bh - c.t) > 0.5) h.failures.push(`${c.name}: scrolled — the backdrop under the clock is ${bh}, not ${c.t}`);
    }

    // «＋» on «Главная» (on «Клиенты» it opens the new client at once): the floating button (phone) or the header one → its sheet
    await h.go("/");
    await insets(p, c);
    const fab = p.locator(wide ? '[data-testid="fab-header"]' : '[data-testid="fab"]').locator("visible=true").first();
    await fab.click();
    await h.sheet().locator('[data-testid^="fab-"]').first().waitFor({ timeout: 3000 });
    await applied(p, c);
    await clear(h, c, "the «＋» sheet", '[aria-modal="true"]');
    await h.shot(`${c.name}-create`);
    await pressEscUntilClosed(p);
    await p.waitForFunction(() => !document.querySelector('[aria-modal="true"] [data-testid^="fab-"]'), null, { timeout: 3000 });

    // the menu: the phone has the «Ещё» tab (a screen); 820 — ☰ opens the drawer; 1280 — the side menu opens in place
    if (!wide) {
      await h.go("/more");
      await insets(p, c);
      await clear(h, c, "«Ещё»");
    } else {
      await h.go("/clients");
      await insets(p, c);
      await p.getByTestId("side-toggle").click();
      // 820: the drawer; 1280: the side menu opens in place (☰ says so)
      const drawer = c.w < 1280;
      if (drawer) await p.getByTestId("menu-drawer").waitFor({ timeout: 3000 });
      else await p.waitForFunction(() => document.querySelector('[data-testid="side-toggle"]')?.getAttribute("aria-expanded") === "true", null, { timeout: 3000 });
      await applied(p, c);
      await clear(h, c, "the menu", drawer ? '[data-testid="menu-drawer"]' : '[data-testid="side-nav"]');
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
      await applied(p, c);
      await clear(h, c, "the full-screen signature", '[data-testid="sig-full"]');
      await h.shot(`${c.name}-signature`);
    }
  }
  if (h.failures.length) console.log(h.failures.join("\n"));
  h.expect(h.failures.length === 0, `\n${h.failures.join("\n")}`);
};
