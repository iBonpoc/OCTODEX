/**
 * e2e 504 — #2132 (founder; DS Б7, §12.2): the screen's «?» stands right after its title, not on the right among the
 * header's actions («＋» · «⋯»). Once in Screen for every screen: a tab root (Plan) and a detail screen (a client card).
 * С1 ДАНО экран с «?»; ТОГДА «?» в одной строке с заголовком, вплотную справа от него (зазор не больше шага сетки).
 * С2 «?» открывает свою шторку, как раньше.
 * Every view; by testID.
 */
exports.run = async (h) => {
  const p = h.page;
  const box = async (id) => p.getByTestId(id).locator("visible=true").first().boundingBox();
  for (const [path, name] of [["/plan", "tab"], ["/client/c1", "detail"]]) {
    await h.go(path);
    await p.getByTestId("screen-help").locator("visible=true").first().waitFor({ timeout: 8000 });
    await h.shot(name);
    const t = await box("screen-title");
    const q = await box("screen-help");
    const gap = q.x - (t.x + t.width);
    const sameRow = q.y < t.y + t.height && q.y + q.height > t.y;
    h.expect(sameRow && gap >= 0 && gap <= 16, `С1 ${name}: «?» right after the title (gap ${Math.round(gap)}, title ${Math.round(t.x)}+${Math.round(t.width)}, «?» ${Math.round(q.x)})`);
  }
  // С2: it still opens its sheet
  await p.getByTestId("screen-help").locator("visible=true").first().click();
  await h.sheet().waitFor({ timeout: 8000 });
  h.expect(true, "С2 «?» opens its sheet");
};
