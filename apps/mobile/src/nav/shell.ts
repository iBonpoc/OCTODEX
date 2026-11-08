/**
 * Side menu geometry on 820/1280 (docs/specs/13 §2.5, 13а §8). Pure — unit-tested in test/shell.test.ts.
 * Phone: no side menu (bottom tabs + ☰). Tablet: the rail only (the full menu opens over it).
 * Desktop: the rail, or the open menu that pushes the content when the person opened it (remembered per person).
 */
import { component, size, space } from "@octo/design-tokens";
import type { Device } from "@/theme/ThemeProvider";

/** `inset`: the left safe area (a notch in landscape, docs/specs/32) — the menu grows by it, its places stay clear */
export function sideNavWidth(device: Device, open: boolean, inset = 0): number {
  if (device === "phone") return 0;
  return (device === "desktop" && open ? component.navMenu : component.navRail) + inset;
}

/** the width the screen's own content gets (the window minus the side menu) */
export const contentWidth = (windowW: number, device: Device, open: boolean, inset = 0) => windowW - sideNavWidth(device, open, inset);

/** pages outside the app: the client page and sign-in have no staff menu (13а §8) */
export const isAppPath = (path: string) => !/^\/(p|f|auth)(\/|$)/.test(path); // f — the request page (docs/specs/34)

export type Insets = { top: number; bottom: number; left: number; right: number };

/**
 * Nav metrics shared by Screen, TabBar, «＋», sheets and the toast (docs/specs/32). Sides: the notch / Dynamic Island in
 * landscape and the rounded corners — max(inset, 16), the rule of the prototypes (padding: max(16px, env(…))).
 * `sideNav`: the side menu is on the left and already keeps clear of the notch — the screen keeps its 16 there.
 * `edgeLeft`: for what lies over the side menu (the toast, menus, the phone sheet).
 */
export function navInsets(insets: Insets, wide: boolean, sideNav: boolean) {
  const edgeLeft = Math.max(insets.left, space[4]);
  return {
    wide,
    // 820/1280: the menu is on the left (SideNav, docs/specs/13 §2.5) — nothing above the screen any more
    top: wide ? insets.top + space[3] : insets.top + space[2],
    bottom: wide ? insets.bottom + space[6] : Math.max(insets.bottom, space[3]) + size.tabbarH + space[2] + space[6],
    tabBottom: Math.max(insets.bottom, space[3]),
    safeTop: insets.top,
    left: sideNav ? space[4] : edgeLeft,
    right: Math.max(insets.right, space[4]),
    edgeLeft,
  };
}

/** the open menu is a choice of a person on a device */
export const openKey = (me: string) => `octo.nav.open.${me}`;

/**
 * The sync badge in the header (13 v2 §2.2, §2.6): only while there is something to say —
 * no network (with what waits in the queue) or the queue is still going out. Otherwise nothing.
 */
export type SyncState = "offline" | "sending" | null;
export const syncState = (online: boolean, queued: number): SyncState => (!online ? "offline" : queued > 0 ? "sending" : null);
