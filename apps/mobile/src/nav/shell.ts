/**
 * Side menu geometry on 820/1280 (docs/specs/13 §2.5, 13а §8). Pure — unit-tested in test/shell.test.ts.
 * Phone: no side menu (bottom tabs + ☰). Tablet: the rail only (the full menu opens over it).
 * Desktop: the rail, or the open menu that pushes the content when the person opened it (remembered per person).
 */
import { component } from "@octo/design-tokens";
import type { Device } from "@/theme/ThemeProvider";

export function sideNavWidth(device: Device, open: boolean): number {
  if (device === "phone") return 0;
  return device === "desktop" && open ? component.navMenu : component.navRail;
}

/** the width the screen's own content gets (the window minus the side menu) */
export const contentWidth = (windowW: number, device: Device, open: boolean) => windowW - sideNavWidth(device, open);

/** the open menu is a choice of a person on a device */
export const openKey = (me: string) => `octo.nav.open.${me}`;

/**
 * The sync badge in the header (13 v2 §2.2, §2.6): only while there is something to say —
 * no network (with what waits in the queue) or the queue is still going out. Otherwise nothing.
 */
export type SyncState = "offline" | "sending" | null;
export const syncState = (online: boolean, queued: number): SyncState => (!online ? "offline" : queued > 0 ? "sending" : null);
