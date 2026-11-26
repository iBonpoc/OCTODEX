/**
 * The phone's bigger text (Dynamic Type, DS §4.3) in the browser (#2761): react-native-web has no system font scale and
 * `html{font-size}` does nothing (sizes are px), so every text node's px `font-size` / `line-height` is multiplied by `scale` as it
 * appears — before the app measures it (a MutationObserver from the page's first script, as iOS draws with the big font from the
 * start) — and the app's own `fontScale` reads the same number (`globalThis.__octoFontScale`, `ui/fontScale.ts`). Every text
 * grows alike: a capped label (`T capped`, `font.labelMaxScale` 1.5) is the same at the 1.25 tried here.
 */
exports.useFontScale = (page, scale) =>
  page.addInitScript((k) => {
    globalThis.__octoFontScale = k;
    const done = new WeakSet();
    const grow = (el) => {
      if (done.has(el) || !(el instanceof HTMLElement)) return;
      const cs = getComputedStyle(el);
      const fs = parseFloat(cs.fontSize);
      if (!fs) return;
      done.add(el);
      el.style.fontSize = `${fs * k}px`;
      const lh = parseFloat(cs.lineHeight);
      if (lh) el.style.lineHeight = `${lh * k}px`;
    };
    const textOf = (root) => {
      if (!(root instanceof HTMLElement)) return;
      if ([...root.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) grow(root);
      root.querySelectorAll("*").forEach((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && grow(el));
    };
    new MutationObserver((ms) => {
      for (const m of ms) {
        if (m.type === "characterData") grow(m.target.parentElement);
        m.addedNodes.forEach((n) => (n.nodeType === 3 ? grow(n.parentElement) : textOf(n)));
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  }, scale);
