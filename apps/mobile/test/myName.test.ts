/**
 * #1606: my own name. The op writes only `full_name` of my own row in public.users (the column grant and the `users_update`
 * policy of the base are the lock; the app never sends another id or another column), the name is tidied (cleanText),
 * and the store (setMyName) changes the team list at once, with the initials, and «Отменить» takes it back.
 */
import { describe, expect, it, vi } from "vitest";

const calls: { table: string; patch?: unknown; eq?: [string, unknown] }[] = [];
vi.mock("@/cloud/client", () => ({
  supabase: {
    from: (table: string) => {
      const c: { table: string; patch?: unknown; eq?: [string, unknown] } = { table };
      calls.push(c);
      return {
        update: (patch: unknown) => {
          c.patch = patch;
          return { eq: (col: string, v: unknown) => ((c.eq = [col, v]), Promise.resolve({ error: null })) };
        },
      };
    },
  },
}));

describe("unit:myName — the op", () => {
  it("me.name updates full_name of my own row only, tidied", async () => {
    const { applyOp } = await vi.importActual<typeof import("../src/cloud/ops")>("../src/cloud/ops");
    await applyOp({ k: "me.name", name: "  Dana Whitfield " }, "co-1", "u-1");
    expect(calls).toEqual([{ table: "users", patch: { full_name: "Dana Whitfield" }, eq: ["id", "u-1"] }]);
  });
});
