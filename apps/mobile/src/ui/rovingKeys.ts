/**
 * Keys of a group of choice rows on the web (DS §9 А2а): ↑ / ↓ move the focus between the rows, Home / End to the ends,
 * Space / Enter choose the focused one. React Native Web presses a Pressable on Enter itself, and on Space only for a `button`:
 * so Space is ours here (and Enter is left to the Pressable — one press, not two). Pure: the group hands its rows and the focus.
 */
export type RovingKey = { key: string; preventDefault: () => void };

export function rovingMove(count: number, at: number, key: string): number | null {
  if (count <= 0) return null;
  if (key === "ArrowDown" || key === "ArrowRight") return at < 0 ? 0 : Math.min(count - 1, at + 1);
  if (key === "ArrowUp" || key === "ArrowLeft") return at < 0 ? 0 : Math.max(0, at - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * The group's onKeyDown (web only): `selector` finds its rows inside the group's element; `choose(i)` is the row's press.
 * `axis` — which arrows move: rows (↑ / ↓) or a line of tiles (← / →).
 */
export function rovingKeyDown(e: RovingKey & { currentTarget: unknown }, selector: string, choose: (i: number) => void, axis: "vertical" | "horizontal" = "vertical") {
  if (typeof document === "undefined") return;
  const root = e.currentTarget as HTMLElement | null;
  if (!root || typeof root.querySelectorAll !== "function") return;
  const rows = Array.from(root.querySelectorAll<HTMLElement>(selector));
  const active = document.activeElement;
  const at = rows.findIndex((r) => r === active || (active instanceof Node && r.contains(active)));
  if (e.key === " " || e.key === "Spacebar") {
    if (at < 0) return;
    e.preventDefault();
    choose(at);
    return;
  }
  const off = axis === "vertical" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
  if (off.includes(e.key)) return;
  const to = rovingMove(rows.length, at, e.key);
  if (to === null) return;
  e.preventDefault();
  rows[to]?.focus();
}
