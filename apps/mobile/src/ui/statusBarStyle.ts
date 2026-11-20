/**
 * The status bar's content (the clock, the battery) is `light` on a dark page and `dark` on a light one — by the APP's theme, not the
 * phone's. The native stack gives every screen its own style, `auto` = the PHONE's appearance: with the app on dark and the phone on
 * light (the person switched the theme in the app) the clock stood dark on dark (the audit's iPhone 17e, #2321). The root `StatusBar`
 * and the stack's `statusBarStyle` both take this.
 */
export type StatusBarContent = "light" | "dark";
export const statusBarStyleFor = (theme: "dark" | "light"): StatusBarContent => (theme === "dark" ? "light" : "dark");
