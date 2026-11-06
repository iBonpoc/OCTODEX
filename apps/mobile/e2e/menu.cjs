/**
 * The app's sections in a spec, at any width (docs/specs/13 v2 §2.1, §2.3, §2.5; variant Б):
 * phone — the «Ещё» tab (tiles); 820 — ☰ on the side rail opens the full menu as a drawer;
 * 1280 — ☰ on the rail opens the side menu in place (it stays open until ☰ again).
 */
exports.menuApi = (h) => {
  const p = h.page;
  const desktop = h.layout.width >= 1280;
  const tablet = !desktop && h.layout.width >= 820;
  const toggle = () => p.getByTestId("side-toggle");
  const phone = !desktop && !tablet;
  // the phone: the «Ещё» screen (the tab navigator keeps other tabs mounted, hidden — take the visible screen)
  const menu = () => (desktop ? p.getByTestId("side-nav") : phone ? p.locator('[data-testid="more-screen"]:visible') : p.getByRole("dialog", { name: "Меню" }));
  const sideOpen = async () => (await toggle().getAttribute("aria-expanded")) === "true";
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
      if (phone) {
        // a tab screen: the «Ещё» tab; a section outside the tabs (My settings…): its «‹ Ещё»
        const tab = p.getByRole("tab", { name: "Ещё", exact: true }).locator("visible=true");
        const back = p.getByTestId("back-more").locator("visible=true");
        if (await tab.count()) await tab.click();
        else if (await back.count()) await back.click();
        else await h.go("/more");
      }
      else await toggle().click();
      await menu().waitFor({ timeout: 3000 });
    },
    async close() {
      if (desktop) {
        if (await sideOpen()) await toggle().click();
      } else if (tablet) await menu().getByRole("button", { name: "Закрыть", exact: true }).click();
      await p.waitForTimeout(400);
    },
    /** the menu went away after a choice (the drawer, the «Ещё» screen); the side menu on 1280 stays open by design */
    async closedAfterChoice() {
      return desktop ? true : (await menu().count()) === 0;
    },
    phone,
  };
};
