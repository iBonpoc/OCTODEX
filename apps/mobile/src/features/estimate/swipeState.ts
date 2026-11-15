/**
 * The state of the row swipes of a screen, without the view (DS Б13): one row is open at a time, a tap right after a swipe
 * is the finger leaving, a button is pressed once until the row closes. Pure, so a test can run it.
 */
export interface Closer {
  close: () => void;
}

export function createSwipeState(now: () => number = Date.now) {
  let open: Closer | null = null;
  let last = 0;
  return {
    /** a swipe began, ended or opened/closed a row just now */
    touched: () => {
      last = now();
    },
    /** the tap that follows a swipe within `slow` ms is not a request to open the row */
    justSwiped: (slow: number) => now() - last < slow,
    /** a row is opening: the one open before it closes */
    opened: (c: Closer) => {
      if (open && open !== c) open.close();
      open = c;
    },
    closed: (c: Closer) => {
      if (open === c) open = null;
    },
    /** a tap on a row or the start of a scroll: closes the open row; says whether there was one (then the tap only closes) */
    closeOpen: (): boolean => {
      const o = open;
      open = null;
      o?.close();
      return !!o;
    },
  };
}

/** a button under a row acts once: the second press waits for the row to close (else two toasts, #1286) */
export function createLock() {
  let on = false;
  return {
    take: (): boolean => {
      if (on) return false;
      on = true;
      return true;
    },
    release: () => {
      on = false;
    },
  };
}

/** the screen's swipes (one list on a screen) */
export const swipes = createSwipeState();
