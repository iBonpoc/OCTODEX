/**
 * Push on this phone (docs/specs/27-push.md §5): where it works, the switch's state, where a tap may go, and the paths
 * of turning on / again on start / off — with fake phone parts (the real ones are src/features/pushNative.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { disable, enable, refresh, routeNow, safeRoute, stateOf, supportOf, type Permission, type PushDeps } from "../src/features/push";

function fake(o: { perm?: Permission; after?: Permission; token?: string | Error; registerErr?: string | null; saved?: string | null } = {}) {
  const log: string[] = [];
  let perm: Permission = o.perm ?? "undetermined";
  let saved: string | null = o.saved ?? null;
  const d: PushDeps = {
    platform: "android",
    permission: async () => perm,
    ask: async () => {
      log.push("ask");
      perm = o.after ?? "granted";
      return perm;
    },
    token: async () => {
      if (o.token instanceof Error) throw o.token;
      return o.token ?? "ExponentPushToken[new]";
    },
    register: async (t, p, l, v) => {
      log.push(`register ${t} ${p} ${l} ${v}`);
      return o.registerErr ?? null;
    },
    forget: async (t) => void log.push(`forget ${t}`),
    load: async () => saved,
    save: async (t) => {
      saved = t;
      log.push(`save ${t}`);
    },
  };
  return { d, log, saved: () => saved, setPerm: (p: Permission) => (perm = p) };
}

describe("push — where it works", () => {
  it("not on the web, not in Expo Go; a build of ours yes", () => {
    expect(supportOf("web", undefined)).toBe("web");
    expect(supportOf("ios", "storeClient")).toBe("expo_go");
    expect(supportOf("android", "storeClient")).toBe("expo_go");
    expect(supportOf("android", "standalone")).toBe("device");
    expect(supportOf("ios", "bare")).toBe("device");
    expect(supportOf("windows", "standalone")).toBe("web");
  });
  it("the switch's state", () => {
    const base = { support: "device" as const, signedIn: true, permission: "granted" as Permission, token: "T" };
    expect(stateOf(base)).toBe("on");
    expect(stateOf({ ...base, token: null })).toBe("off");
    expect(stateOf({ ...base, permission: "undetermined", token: null })).toBe("off");
    expect(stateOf({ ...base, permission: "denied" })).toBe("denied");
    expect(stateOf({ ...base, signedIn: false })).toBe("signed_out");
    expect(stateOf({ ...base, support: "web" })).toBe("web");
    expect(stateOf({ ...base, support: "expo_go" })).toBe("expo_go");
  });
});

describe("push — where a tap goes (only our own screens)", () => {
  const id = "0e730000-0000-4000-8000-000000000003";
  it("an estimate, an invoice, a visit, a lead, a job, the bell", () => {
    for (const s of ["estimate", "invoice", "visit", "lead", "job"]) expect(safeRoute({ route: `/${s}/${id}` })).toBe(`/${s}/${id}`);
    expect(safeRoute({ route: "/notifications" })).toBe("/notifications");
  });
  it("anything else is ignored", () => {
    for (const bad of [
      "https://evil.test", "//evil.test/estimate", `/estimate/${id}?x=1`, `/estimate/${id}/../settings`, "/settings/delete-account",
      `/estimate/${id.toUpperCase()}x`, "/estimate/1", "", 5, null, undefined,
    ]) expect(safeRoute({ route: bad })).toBeNull();
    expect(safeRoute(null)).toBeNull();
    expect(safeRoute("/notifications")).toBeNull();
  });
});

describe("push — a tapped push waits until it can open (review #278)", () => {
  const ready = { route: "/notifications", navReady: true, authReady: true, signedIn: true, storeReady: true };
  it("everything ready: open", () => expect(routeNow(ready)).toBe("open"));
  it("no push: nothing", () => expect(routeNow({ ...ready, route: null })).toBe("none"));
  it("cold start: the navigator not mounted yet, the session not restored, the store loading — wait", () => {
    expect(routeNow({ ...ready, navReady: false })).toBe("wait");
    expect(routeNow({ ...ready, authReady: false })).toBe("wait");
    expect(routeNow({ ...ready, storeReady: false })).toBe("wait");
  });
  it("not signed in: the link waits for the sign-in, then opens", () => {
    expect(routeNow({ ...ready, signedIn: false })).toBe("wait");
    expect(routeNow({ ...ready, signedIn: true })).toBe("open");
  });
});

describe("push — turning on", () => {
  it("asks only when not allowed yet, registers with the interface language, keeps the token", async () => {
    const f = fake();
    expect(await enable(f.d, "es", "1.0.0 · 1")).toBe("on");
    expect(f.log).toEqual(["ask", "register ExponentPushToken[new] android es 1.0.0 · 1", "save ExponentPushToken[new]"]);
    const g = fake({ perm: "granted" });
    await enable(g.d, "en", "v");
    expect(g.log[0]).not.toBe("ask");
  });
  it("refused by the phone: nothing goes to the server", async () => {
    const f = fake({ after: "denied" });
    expect(await enable(f.d, "en", "v")).toBe("denied");
    expect(f.log).toEqual(["ask"]);
  });
  it("no token (no network, no Firebase) or the server refused: «failed», the token is not kept", async () => {
    const f = fake({ perm: "granted", token: new Error("no fcm") });
    expect(await enable(f.d, "en", "v")).toBe("failed");
    expect(f.saved()).toBeNull();
    const g = fake({ perm: "granted", registerErr: "42501" });
    expect(await enable(g.d, "en", "v")).toBe("failed");
    expect(g.saved()).toBeNull();
  });
});

describe("push — again on start / foreground / language", () => {
  it("not turned on here: nothing happens (no question, no server)", async () => {
    const f = fake({ perm: "granted" });
    expect(await refresh(f.d, "ru", "v")).toBe("off");
    expect(f.log).toEqual([]);
  });
  it("turned on: registers again (the last registration wins — a phone handed over comes back)", async () => {
    const f = fake({ perm: "granted", saved: "ExponentPushToken[new]", token: "ExponentPushToken[new]" });
    expect(await refresh(f.d, "ru", "v")).toBe("on");
    expect(f.log).toEqual(["register ExponentPushToken[new] android ru v", "save ExponentPushToken[new]"]);
  });
  it("the token changed: the old one is forgotten, the new one registered", async () => {
    const f = fake({ perm: "granted", saved: "ExponentPushToken[old]", token: "ExponentPushToken[new]" });
    await refresh(f.d, "en", "v");
    expect(f.log).toEqual(["forget ExponentPushToken[old]", "register ExponentPushToken[new] android en v", "save ExponentPushToken[new]"]);
  });
  it("turned off in the phone's settings: the server forgets this phone", async () => {
    const f = fake({ perm: "denied", saved: "ExponentPushToken[old]" });
    expect(await refresh(f.d, "en", "v")).toBe("denied");
    expect(f.log).toEqual(["forget ExponentPushToken[old]", "save null"]);
  });
  it("no network: stays on, the token is kept for the next time", async () => {
    const f = fake({ perm: "granted", saved: "ExponentPushToken[old]", token: new Error("offline") });
    expect(await refresh(f.d, "en", "v")).toBe("on");
    expect(f.saved()).toBe("ExponentPushToken[old]");
  });
});

describe("push — turning off and signing out", () => {
  it("forgets this phone on the server and here", async () => {
    const f = fake({ perm: "granted", saved: "ExponentPushToken[t]" });
    await disable(f.d);
    expect(f.log).toEqual(["forget ExponentPushToken[t]", "save null"]);
  });
  it("nothing kept: nothing to forget", async () => {
    const f = fake();
    await disable(f.d);
    expect(f.log).toEqual(["save null"]);
  });
});

describe("push — the token never reaches a log (review #272)", () => {
  it("no console.* and no analytics in the push files", () => {
    for (const f of ["push.ts", "pushNative.ts", "PushBridge.tsx", "PushSettings.tsx"]) {
      // the code only: the comments may say what is not done
      const s = readFileSync(path.join(__dirname, "../src/features", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(s, f).not.toMatch(/console\.|Sentry|analytics|track\(/);
    }
  });
});
