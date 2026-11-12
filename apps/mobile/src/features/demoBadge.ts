/**
 * The «Демо» strip (#1183 п.1, DS §13): in the demo the data lives on this phone only and is a made-up company — a person
 * who works in it thinking it is theirs loses it. So every screen of the app says so, always, until they sign in.
 * Not on the client's pages (/p/, /f/) and not on the sign-in pages themselves (/auth/…).
 */
export function showsDemoBadge(mode: "cloud" | "demo", path: string): boolean {
  if (mode !== "demo") return false;
  return !(path.startsWith("/p/") || path.startsWith("/f/") || path.startsWith("/auth/"));
}
