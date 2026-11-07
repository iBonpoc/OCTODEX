/**
 * Push notifications on this phone (docs/specs/27-push.md §5). Pure: the phone's parts (permission, the Expo token,
 * the server, the local store) come in as `PushDeps`, so vitest checks every path (test/push.test.ts); the real ones
 * are in pushNative.ts.
 * - Pushes need our own build: not on the web, not in Expo Go (SDK 53+).
 * - The person turns them on in «Settings → Notifications»; after that the token is registered again on every start,
 *   return to the foreground and language change (the last registration wins: a phone handed over comes back).
 * - The token is never logged, sent to analytics or shown (review #272: someone who knows it may move the phone).
 */
export type PushSupport = "web" | "expo_go" | "device";
export type Permission = "granted" | "denied" | "undetermined";
export type PushState = "web" | "expo_go" | "signed_out" | "off" | "on" | "denied";
export type PushLang = "en" | "es" | "ru";

/** the token of this phone, kept only on the phone (the server never gives it back) */
export const PUSH_TOKEN_KEY = "octo.push.token.v1";

/** Expo Go is «storeClient»; a build of ours is «standalone» (EAS) or «bare» */
export function supportOf(os: string, executionEnvironment: string | undefined): PushSupport {
  if (os === "web") return "web";
  if (os !== "ios" && os !== "android") return "web";
  return executionEnvironment === "storeClient" ? "expo_go" : "device";
}

export function stateOf(p: { support: PushSupport; signedIn: boolean; permission: Permission; token: string | null }): PushState {
  if (p.support !== "device") return p.support;
  if (!p.signedIn) return "signed_out";
  if (p.permission === "denied") return "denied";
  return p.permission === "granted" && p.token ? "on" : "off";
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ROUTE = new RegExp(`^/(estimate|invoice|visit|lead|job)/${UUID}$|^/notifications$`);
/** where a tap on a push goes: only our own screens, by id (the server writes `route`, but a push is outside data) */
export function safeRoute(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const r = (data as { route?: unknown }).route;
  return typeof r === "string" && r.length <= 200 && ROUTE.test(r) ? r : null;
}

/** A tapped push waits until it can really open (review #278): the root navigator is mounted (a push before it —
 *  «navigate before mounting the Root Layout»), the session is restored, the person is signed in (else the route guard
 *  sends them to sign-in and the link is lost — it waits and opens after the sign-in) and the store has loaded. */
export function routeNow(p: { route: string | null; navReady: boolean; authReady: boolean; signedIn: boolean; storeReady: boolean }): "none" | "wait" | "open" {
  if (!p.route) return "none";
  return p.navReady && p.authReady && p.signedIn && p.storeReady ? "open" : "wait";
}

export interface PushDeps {
  platform: "ios" | "android";
  permission: () => Promise<Permission>;
  /** the system question (only on the person's tap) */
  ask: () => Promise<Permission>;
  /** the Expo push token of this phone (throws without the network or Firebase / APNs) */
  token: () => Promise<string>;
  /** public.register_push_device; null or the error */
  register: (token: string, platform: "ios" | "android", lang: PushLang, version: string) => Promise<string | null>;
  /** public.forget_push_device; never throws */
  forget: (token: string) => Promise<void>;
  load: () => Promise<string | null>;
  save: (token: string | null) => Promise<void>;
}

export type EnableResult = "on" | "denied" | "failed";

/** the person tapped «Turn on»: ask, take the token, tell the server, remember the token */
export async function enable(d: PushDeps, lang: PushLang, version: string): Promise<EnableResult> {
  let perm = await d.permission();
  if (perm !== "granted") perm = await d.ask();
  if (perm !== "granted") return "denied";
  try {
    const tok = await d.token();
    const err = await d.register(tok, d.platform, lang, version);
    if (err) return "failed";
    await d.save(tok);
    return "on";
  } catch {
    return "failed";
  }
}

/** on start / foreground / language change: only when the person turned pushes on here; quiet on any failure.
 *  The token may change (Expo / the system renews it): the new one is registered, the old one forgotten. */
export async function refresh(d: PushDeps, lang: PushLang, version: string): Promise<PushState> {
  const saved = await d.load();
  if (!saved) return "off";
  const perm = await d.permission();
  if (perm !== "granted") {
    // turned off in the phone's settings: the server stops sending to it
    await d.forget(saved);
    await d.save(null);
    return perm === "denied" ? "denied" : "off";
  }
  try {
    const tok = await d.token();
    if (tok !== saved) await d.forget(saved);
    const err = await d.register(tok, d.platform, lang, version);
    if (!err) await d.save(tok);
  } catch {
    // no network: the server keeps the last registration; next time again
  }
  return "on";
}

/** «Turn off on this phone» and signing out: the server forgets this phone, the phone forgets the token */
export async function disable(d: Pick<PushDeps, "load" | "save" | "forget">): Promise<void> {
  const saved = await d.load();
  if (saved) await d.forget(saved);
  await d.save(null);
}
