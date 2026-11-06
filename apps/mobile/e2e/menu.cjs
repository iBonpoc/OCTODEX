/**
 * The app menu in a spec, at any width (docs/specs/13 §2.3, §2.5; 13а §8):
 * phone — ☰ in the header opens the drawer; 820 — ☰ on the side rail opens the same drawer;
 * 1280 — ☰ on the rail opens the side menu in place (it stays open until ☰ again).
 */
exports.menuApi = (h) => {
  const p = h.page;
  const desktop = h.layout.width >= 1280;
  const tablet = !desktop && h.layout.width >= 820;
  const toggle = () => p.getByTestId("side-toggle");
  const menu = () => (desktop ? p.getByTestId("side-nav") : p.getByRole("dialog", { name: "Меню" }));
  const sideOpen = async () => (await toggle().getAttribute("aria-expanded")) === "true";
  /** the visible ☰ in a header (the tab navigator keeps visited tabs mounted, hidden, with their own ☰) */
  const headerButton = async () => {
    const all = p.getByRole("button", { name: "Меню", exact: true });
    for (let t = 0; t < 15; t++, await p.waitForTimeout(200))
      for (let i = (await all.count()) - 1; i >= 0; i--) if (await all.nth(i).isVisible()) return all.nth(i);
    throw new Error("no visible ☰");
  };
  return {
    desktop,
    tablet,
    menu,
    async open() {
      if (desktop) {
        if (!(await sideOpen())) await toggle().click();
        await p.waitForTimeout(300);
        return;
      }
      await (tablet ? toggle() : await headerButton()).click();
      await menu().waitFor({ timeout: 3000 });
    },
    async close() {
      if (desktop) {
        if (await sideOpen()) await toggle().click();
      } else await menu().getByRole("button", { name: "Закрыть", exact: true }).click();
      await p.waitForTimeout(400);
    },
    /** the menu went away after a choice (the drawer); the side menu on 1280 stays open by design */
    async closedAfterChoice() {
      return desktop ? true : (await menu().count()) === 0;
    },
  };
};
