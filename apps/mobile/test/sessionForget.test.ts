/**
 * unit:sessionForget (#1634) — the account deletion takes the session out of the protected store too (the iOS Keychain
 * outlives the app): the three keys of auth-js under the client's own storageKey.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
const { forget, auth } = vi.hoisted(() => ({ forget: vi.fn(async (_keys: string[]) => {}), auth: { storageKey: "sb-abcdefgh-auth-token" as string | undefined } }));
vi.mock("@/cloud/sessionStore", () => ({ sessionStore: { forget } }));
vi.mock("@/cloud/client", () => ({ supabase: { auth } }));

import { forgetSession } from "../src/cloud/account";

describe("unit:sessionForget (#1634)", () => {
  it("the session, its user and its code verifier leave both stores", async () => {
    await forgetSession();
    expect(forget).toHaveBeenCalledWith(["sb-abcdefgh-auth-token", "sb-abcdefgh-auth-token-user", "sb-abcdefgh-auth-token-code-verifier"]);
  });
  it("the client's storageKey is there (auth-js keeps it on the client): a rename would make the wipe do nothing", async () => {
    const real = await vi.importActual<typeof import("@supabase/auth-js")>("@supabase/auth-js");
    const c = new real.GoTrueClient({ url: "http://127.0.0.1:1/auth/v1", storageKey: "sb-x-auth-token", persistSession: false, autoRefreshToken: false });
    expect((c as unknown as { storageKey?: string }).storageKey).toBe("sb-x-auth-token");
  });
});
