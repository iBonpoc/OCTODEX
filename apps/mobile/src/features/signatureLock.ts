/**
 * #3156 (code-reviewer on #3155): the signature pad stops the screen's scroll while a finger draws on it — on at the stroke's
 * grant, off at its release or termination, and ALSO off when the pad leaves the screen with the finger still on it (an estimate
 * signed meanwhile on /p/ leaves draft/sent and its sign block goes; termination is not promised then). Without the last one the
 * screen stayed locked — nothing scrolled until the screen was left. Pure (no react-native): tested on its own (signatureLock.test.ts).
 * `lock` is read at each call: the screen's lock function may change between renders.
 */
export function padScrollLock(lock: () => (locked: boolean) => void) {
  let held = false;
  const set = (on: boolean) => {
    if (held === on) return;
    held = on;
    lock()(on);
  };
  return {
    grant: () => set(true),
    release: () => set(false),
    terminate: () => set(false),
    /** the pad is gone: a held lock is let go */
    unmount: () => set(false),
    get held() {
      return held;
    },
  };
}
