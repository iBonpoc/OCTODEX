import { router, type Href } from "expo-router";
import { appStackRoutes, goAction, popsToTab, type NavState } from "./tabBarRule";

/** the root navigation state as the shell last rendered it (TabBar): goTo is called from handlers, not hooks */
let navState: NavState;
export const setNavState = (s: unknown) => {
  navState = s as NavState;
};

/**
 * To a screen above or to a tab: if it is already below us in the stack we pop to it,
 * otherwise it replaces this screen (so "back" never walks into a loop). The tabs on top with a card under them (opened by
 * a link): navigate — dismissTo did nothing there (e2e 134). The tab right under the cards: pop to it (popsToTab).
 */
export function goTo(href: string) {
  // up to the very tab under the cards (Leads from «Ещё» → a lead → «‹ Лиды»): pop, the tab keeps `from=more`
  const pops = popsToTab(navState, href);
  if (pops) return router.dismiss(pops);
  const a = goAction(appStackRoutes(navState), router.canDismiss());
  if (a === "dismissTo") router.dismissTo(href as Href);
  else if (a === "navigate") router.navigate(href as Href);
  else router.replace(href as Href);
}

/**
 * A section chosen in ☰ (docs/specs/13а §3): a tab is switched to; any other screen is pushed on top, so system back /
 * swipe returns where the menu was opened (replace from a tab closed the app on Android — review of #144).
 */
export function openSection(href: string) {
  router.navigate(href as Href);
}
