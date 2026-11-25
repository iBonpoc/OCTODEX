/**
 * e2e 472 — #2003 (founder 17.11: «я загрузил логотип, а он какой-то растянутый»). Every view, by testID and the store.
 * С1 ДАНО «Логотип и цвет», КОГДА загружен широкий логотип 800 × 200, ТОГДА сохранён 256 × 64 — не квадрат (было 256 × 256).
 * С2 ДАНО логотип есть, ТОГДА кнопка удаления — «Удалить логотип», а не «Удалить из каталога».
 */
exports.run = async (h) => {
  const p = h.page;
  const tid = (id) => p.getByTestId(id).locator("visible=true").first();
  await h.go("/company/brand");
  await tid("co-group-logo").waitFor({ timeout: 8000 });
  // a wide PNG (800 × 200) drawn by the browser
  const b64 = await p.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 200;
    const g = c.getContext("2d");
    g.fillStyle = "#1e6fd9";
    g.fillRect(0, 0, 800, 200);
    g.fillStyle = "#ffffff";
    g.fillRect(40, 40, 120, 120);
    return c.toDataURL("image/png").split(",")[1];
  });
  const chooser = p.waitForEvent("filechooser", { timeout: 8000 });
  await tid("co-group-logo").getByRole("button", { name: /Загрузить логотип|Заменить логотип|логотип/i }).first().click();
  await (await chooser).setFiles({ name: "wide-logo.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") });
  // the logo's picture in its group (by the group, so the check also stands on the code before #2003)
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="co-group-logo"] img')].some((e) => e.getAttribute("src")?.startsWith("data:image")), null, { timeout: 8000 });
  // the stored logo (the draft, shown on the screen): its own size
  const size = await p.evaluate(() => new Promise((res) => {
    const el = [...document.querySelectorAll('[data-testid="co-group-logo"] img')].find((e) => e.getAttribute("src")?.startsWith("data:image"));
    const src = el ? el.getAttribute("src") : null;
    if (!src) return res(null);
    const i = new Image();
    i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight });
    i.src = src;
  }));
  h.expect(!!size, "С1 the logo is shown");
  h.expect(size.w === 256 && size.h === 64, `С1 a wide logo stays wide: 256 × 64, not a square (${JSON.stringify(size)})`);
  // С2: its own words for removing
  h.expect((await tid("co-group-logo").getByRole("button", { name: "Удалить логотип" }).count()) === 1, "С2 «Удалить логотип»");
  h.expect((await p.getByRole("button", { name: "Удалить из каталога" }).count()) === 0, "С2 not «Удалить из каталога»");
  await h.shot("wide-logo");
};
