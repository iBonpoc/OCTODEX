/**
 * The address of THIS screen, from its own route — not the app's current address.
 *
 * Why: a list stays mounted under a card. While the card slides away on «back», the app's address
 * (usePathname) still points at the card for a moment, and the list drew the card's header
 * («‹ Clients», «Clients · Client») until the animation ended. A screen's own route never changes.
 *
 * `name` is the route name expo-router gives the screen ("(tabs)/clients", "clients", "client/[id]",
 * "settings/index"); `params` are the screen's own params. Pure function — test/screenPath.test.ts.
 */
type P = Record<string, string | string[] | undefined>;

export function screenPath(name: string, params: P = {}): string {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("/") : v ?? "");
  const seg = name
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .map((s) => {
      const rest = /^\[\.\.\.(.+)\]$/.exec(s);
      if (rest) return one(params[rest[1]!]);
      const dyn = /^\[(.+)\]$/.exec(s);
      return dyn ? one(params[dyn[1]!]) : s;
    })
    .filter(Boolean);
  if (seg[seg.length - 1] === "index") seg.pop();
  return `/${seg.join("/")}`;
}
