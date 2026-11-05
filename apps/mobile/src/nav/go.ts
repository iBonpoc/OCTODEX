import { router, type Href } from "expo-router";

/**
 * To a screen above or to a tab: if it is already below us in the stack we pop to it,
 * otherwise it replaces this screen (so "back" never walks into a loop).
 */
export function goTo(href: string) {
  if (router.canDismiss()) router.dismissTo(href as Href);
  else router.replace(href as Href);
}
