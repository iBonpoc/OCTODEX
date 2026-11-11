/**
 * A menu item picked (#743): the menu closes first, and only then does the pick run. On iPhone a Modal does not show
 * while another one is still closing — an item that opens a sheet right away (the drawing's «Ещё» → «Привязать»,
 * a client's status → its sheet) left an invisible layer that took every touch: the app hung. So the pick waits for
 * the menu's own Modal to be gone: iOS says so (`onDismiss`); Android and the web have no such call — the next frame.
 * A net under iOS: should `onDismiss` not come (some React Native versions lost it), the pick runs on a timer — an item
 * that does nothing would be worse than a late one. Either way the pick runs once.
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
  /** iOS: run `f` after `ms` unless cancelled (the net for a lost `onDismiss`); returns the cancel */
  later: (f: () => void, ms: number) => () => void;
  /** how long iOS may take to say the menu is gone */
  waitMs: number;
}): MenuPick<K> {
  let pending: { key: K } | null = null;
  let cancel: (() => void) | null = null;
  const flush = () => {
    cancel?.();
    cancel = null;
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
      else {
        cancel?.();
        cancel = o.later(flush, o.waitMs);
      }
    },
    dismissed: flush,
  };
}
