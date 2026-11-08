/**
 * A photo's address the screen may load (visit photos; the same rule a module uses for its own photos, #384). On the web the
 * file picker gives a `blob:` address of the open page; the phone's copy of the data keeps it, but after a reload (or in
 * another tab) it points at nothing — the preview stays empty and the browser logs ERR_FILE_NOT_FOUND. Such an address is
 * shown only while the page that made it is open; otherwise the tile shows the picture sign, like a photo that lives on the
 * server. Pure but for the set of this page's addresses.
 */
const here = new Set<string>();

/** an address the picker made on this page (call it when a photo is picked) */
export function madeHere(uri: string | undefined): void {
  if (uri && uri.startsWith("blob:")) here.add(uri);
}

/** the address to load, or undefined: a `blob:` of another page (dead) is never loaded */
export function liveUri(uri: string | undefined, made: ReadonlySet<string> = here): string | undefined {
  if (!uri) return undefined;
  return uri.startsWith("blob:") && !made.has(uri) ? undefined : uri;
}
