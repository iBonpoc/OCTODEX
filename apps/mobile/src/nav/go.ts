import { router, type Href } from "expo-router";

/**
 * To a screen above or to a tab: if it is already below us in the stack we pop to it,
 * otherwise it replaces this screen (so "back" never walks into a loop).
 */
export function goTo(href: string) {
  if (router.canDismiss()) router.dismissTo(href as Href);
  else router.replace(href as Href);
}

/**
 * A section chosen in ☰ (docs/specs/13а §3): a tab is switched to; any other screen is pushed on top, so system back /
 * swipe returns where the menu was opened (replace from a tab closed the app on Android — review of #144).
 */
export function openSection(href: string) {
  router.navigate(href as Href);
}
