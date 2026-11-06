/**
 * Wave 7б-1 (docs/specs/03 §12): «Показывать выполненные» is a personal setting on the server (member_prefs), the same on
 * every device. The old device value moves into it once; old saved data reads as the defaults; the op goes to the one
 * server function (public.set_my_prefs — only for yourself), never a direct write of member_prefs.
 */
import { describe, expect, it, vi } from "vitest";

const calls: { kind: "rpc" | "from"; name: string; args?: unknown }[] = [];
vi.mock("../src/cloud/client", () => ({
  supabase: {
    from: (t: string) => { calls.push({ kind: "from", name: t }); throw new Error("no direct table write"); },
    rpc: (name: string, args: unknown) => { calls.push({ kind: "rpc", name, args }); return Promise.resolve({ data: null, error: null }); },
  },
}));

import { applyOp } from "../src/cloud/ops";
import { normalizeDB } from "../src/data/normalize";
import { makeSeed } from "../src/data/seed";
import type { DB } from "../src/data/types";
import { legacyShowDoneMove } from "../src/features/prefsMove";

describe("personal settings (7б-1)", () => {
  it("the op is the server function for my company, with the value", async () => {
    await applyOp({ k: "me.prefs", prefs: { planShowDone: true } }, "co-1", "u-1");
    expect(calls).toEqual([{ kind: "rpc", name: "set_my_prefs", args: { p_company_id: "co-1", p_plan_show_done: true } }]);
  });
  it("old saved data (no prefs) reads as the defaults: completed hidden", () => {
    const old = { ...makeSeed() } as Partial<DB>;
    delete old.prefs;
    expect(normalizeDB(old as DB, "demo").prefs).toEqual({ planShowDone: false });
    expect(normalizeDB({ ...makeSeed(), prefs: { planShowDone: true } }, "demo").prefs).toEqual({ planShowDone: true });
  });
  it("the device's old «show» moves into the personal setting once; «hide» or an empty key writes nothing", () => {
    expect(legacyShowDoneMove(true, { planShowDone: false })).toEqual({ planShowDone: true });
    expect(legacyShowDoneMove(true, undefined)).toEqual({ planShowDone: true });
    expect(legacyShowDoneMove(true, { planShowDone: true })).toBeNull();
    expect(legacyShowDoneMove(false, { planShowDone: false })).toBeNull();
    expect(legacyShowDoneMove(null, { planShowDone: false })).toBeNull();
  });
});
