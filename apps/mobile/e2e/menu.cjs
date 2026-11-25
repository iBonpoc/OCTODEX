/**
 * The app's sections in a spec, at any width (docs/specs/13 v2 §2.1, §2.3, §2.5; variant Б):
 * phone — the «Ещё» screen behind the header's avatar (v2); 820 — ☰ on the side rail opens the full menu as a drawer;
 * 1280 — ☰ on the rail opens the side menu in place (it stays open until ☰ again).
 */
/**
 * The root header's avatar (v2: it opens «Ещё»; home-profile on «Главная», hdr-avatar on the other roots). The tab
 * navigator keeps other screens mounted — with their own avatar on the same spot — so the one on top is the one the
 * point under it hits. Returns false when no avatar is on screen.
 */
const AVATAR = '[data-testid="home-profile"], [data-testid="hdr-avatar"]';
async function clickAvatar(p) {
  const i = await p.evaluate((sel) => {
    const all = [...document.querySelectorAll(sel)];
    return all.findIndex((e) => {
      const b = e.getBoundingClientRect();
      if (b.width < 1 || b.height < 1) return false;
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return !!hit && e.contains(hit);
    });
  }, AVATAR);
  if (i < 0) return false;
  await p.locator(AVATAR).nth(i).click();
  return true;
}
exports.clickAvatar = clickAvatar;

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
        // v2: «Ещё» is the avatar of a root's header (home-profile on «Главная», hdr-avatar on the other roots);
        // a section opened from «Ещё» (Jobs, My settings…): its «‹ Ещё»
        const back = p.getByTestId("back-more").locator("visible=true");
        if (await clickAvatar(p));
        else if (await back.count()) await back.first().click();
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
