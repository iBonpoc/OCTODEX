/** the count on a header icon (HeaderIcon `badge`): none at 0 (or less), the number up to 99, then «99+» */
export function badgeText(n: number): string | null {
  if (!(n > 0)) return null;
  return n > 99 ? "99+" : String(Math.floor(n));
}
