/**
 * e2e 320 — подписи под кнопками панели холста Gutters не обрезаются «…» при крупном шрифте (#1303, снимок 5-draw ветки
 * claude/e5-fonts-shots). Шрифт крупнее имитируется стилем на всех подписях панели (в вебе масштаб системного шрифта
 * недоступен). Every view: no caption in the toolbar is clipped, and the toolbar stays inside the screen.
 * Finds things by testID; waits on what it checks.
 */
exports.run = async (h) => {
  const p = h.page;
  await h.go("/module/gutters/draw");
  await p.getByTestId("draw-toolbar").locator("visible=true").waitFor({ timeout: 8000 });
  await p.evaluate(() => {
    const st = document.createElement("style");
    st.textContent = '[data-testid="draw-toolbar"] [dir] { font-size: 17px !important; line-height: 20px !important; }';
    document.head.appendChild(st);
  });
  await p.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="draw-toolbar"] [dir]')).fontSize === "17px", null, { timeout: 5000 });
  const r = await p.evaluate(() => {
    const bar = document.querySelector('[data-testid="draw-toolbar"]');
    const clipped = [];
    let texts = 0;
    for (const el of bar.querySelectorAll("[dir]")) {
      if (!el.textContent || !el.textContent.trim()) continue;
      texts++;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 || (cs.textOverflow === "ellipsis" && cs.overflow === "hidden")) clipped.push(el.textContent);
    }
    const b = bar.getBoundingClientRect();
    return { texts, clipped, left: b.left, right: b.right, width: window.innerWidth };
  });
  h.expect(r.texts >= 4, `the toolbar has captions (${r.texts})`);
  h.expect(r.clipped.length === 0, `no caption is clipped (${r.clipped.join(" | ")})`);
  h.expect(r.left >= -1 && r.right <= r.width + 1, `the toolbar is inside the screen (${r.left}…${r.right} of ${r.width})`);
};
