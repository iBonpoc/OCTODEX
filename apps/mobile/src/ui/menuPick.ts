/**
 * A menu item picked (#743): the menu closes first, and only then does the pick run. On iPhone a Modal does not show
 * while another one is still closing — an item that opens a sheet right away (the drawing's «Ещё» → «Привязать»,
 * a client's status → its sheet) left an invisible layer that took every touch: the app hung. So the pick waits for
 * the menu's own Modal to be gone: iOS says so (`onDismiss`); Android and the web have no such call — the next frame.
 * Pure: the menu hands it its close, the pick and how to wait.
 */
export interface MenuPick<K> {
  /** an item pressed: close the menu, keep the key until the menu is gone */
  pick: (key: K) => void;
  /** the menu's Modal is gone (iOS `onDismiss`): run the kept pick, once */
  dismissed: () => void;
}

export function menuPick<K>(o: {
  close: () => void;
  select: (key: K) => void;
  /** iOS: wait for `dismissed()`; otherwise the pick runs on the next frame */
  waitsForDismiss: boolean;
  nextFrame: (f: () => void) => void;
}): MenuPick<K> {
  let pending: { key: K } | null = null;
  const flush = () => {
    if (!pending) return;
    const { key } = pending;
    pending = null;
    o.select(key);
  };
  return {
    pick: (key) => {
      pending = { key };
      o.close();
      if (!o.waitsForDismiss) o.nextFrame(flush);
    },
    dismissed: flush,
  };
}
