/**
 * unit:deleteAccount — «Удалить аккаунт» in the app (wave 7а-2b, story map S22; docs/specs/19 §6.10–§6.12).
 * The server's texts are taken from migration 20261106200000 (OD001) and supabase/functions/delete-account/handler.ts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  accountErrorKey, afterDelete, filterMark, pendingOf, wipedAlready, wipeMark, authEventPlan, codeErrorKey, CONFIRM_WORD, deleteBlock, deleteWithRepeat, goneChecker, makeOnce, WIPE_PENDING_KEY, type AccountState, type Gone, isDeviceKey, lastOwnerCompanies, normalizeWord, readDeleteAnswer, wipeDevice, wordOk,
} from "../src/features/deleteAccount";

const ROOT = path.resolve(__dirname, "../../..");
const sql = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.includes("delete_account")).map((f) => fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8")).join("\n");
const handler = (() => {
  const p = path.join(ROOT, "supabase/functions/delete-account/handler.ts");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
})();

describe("unit:deleteAccount — the word", () => {
  it("the word of the app's language, trimmed and upper-cased", () => {
    expect(CONFIRM_WORD).toEqual({ ru: "УДАЛИТЬ", en: "DELETE", es: "ELIMINAR" });
    expect(normalizeWord("  удалить ")).toBe("УДАЛИТЬ");
    expect(wordOk(" удалить ", "ru")).toBe(true);
    expect(wordOk("delete", "en")).toBe(true);
    expect(wordOk("eliminar", "es")).toBe(true);
  });
  it("another language's word, or a near word, is not it", () => {
    expect(wordOk("DELETE", "ru")).toBe(false);
    expect(wordOk("УДАЛИ", "ru")).toBe(false);
    expect(wordOk("", "en")).toBe(false);
  });
  it("the server accepts exactly these three words", () => {
    if (!sql) return; // the migration lands with #214
    for (const w of Object.values(CONFIRM_WORD)) expect(sql).toContain(`'${w}'`);
  });
});

describe("unit:deleteAccount — the server's answers → the app's words", () => {
  const cases: [string, number | undefined, string][] = [
    ["sign in first", 401, "acct.err.signIn"],
    ["sign in first", 400, "acct.err.signIn"],
    ["sign in again first", 400, "acct.err.fresh"],
    ["type the word to confirm", 400, "acct.err.word"],
    ["the company keeps at least one active owner", 400, "acct.err.lastOwner"],
    ["transfer the company first", 400, "acct.err.transferFirst"],
    ["no such person on the team", undefined, "acct.err.noPerson"],
    ["try again", 400, "acct.err.retry"],
    ["account deletion failed", 500, "acct.err.failed"],
    ["bad request", 400, "acct.err.failed"],
    ["TypeError: Failed to fetch", undefined, "acct.err.network"],
    ["Token has expired or is invalid", undefined, "acct.err.code"],
    ["", undefined, "acct.err.failed"],
  ];
  for (const [msg, st, key] of cases) it(`«${msg}» (${st ?? "—"}) → ${key}`, () => expect(accountErrorKey(msg, st)).toBe(key));
  it("every own refusal of the server is one of them, word for word", () => {
    if (!sql) return;
    const own = [...sql.matchAll(/raise exception '([^']+)' using errcode = 'OD001'/g)].map((m) => m[1]!);
    expect(own.length).toBeGreaterThan(3);
    for (const m of own) expect(accountErrorKey(m), m).not.toBe("acct.err.failed");
    if (handler) for (const m of ["sign in first", "account deletion failed"]) expect(handler).toContain(m);
  });
});

describe("unit:deleteAccount — the last owner", () => {
  const rows = [
    { company_id: "A", user_id: "me", role: "owner", status: "active" },
    { company_id: "A", user_id: "b", role: "admin", status: "active", name: "Bob" },
    { company_id: "A", user_id: "c", role: "tech", status: "active" },
    { company_id: "A", user_id: "x", role: "admin", status: "disabled", name: "Off" },
    { company_id: "B", user_id: "me", role: "owner", status: "active" },
    { company_id: "B", user_id: "o2", role: "owner", status: "active" },
    { company_id: "C", user_id: "me", role: "owner", status: "active" },
    { company_id: "C", user_id: "o3", role: "owner", status: "disabled" },
    { company_id: "D", user_id: "me", role: "admin", status: "active" },
  ];
  it("only where no other ACTIVE owner is left; admins are the active ones", () => {
    const out = lastOwnerCompanies(rows, "me", { A: "Acme", C: "Cee" });
    expect(out.map((c) => c.companyId)).toEqual(["A", "C"]);
    expect(out[0]).toEqual({ companyId: "A", name: "Acme", admins: [{ id: "b", name: "Bob" }], others: 2 });
    expect(out[1]!.admins).toEqual([]);
  });
});

describe("unit:deleteAccount — may it be pressed", () => {
  const ok = { account: true, unsent: 0, fresh: true, wordOk: true, undecided: 0 };
  it("in the order of the screen", () => {
    expect(deleteBlock(ok)).toBeNull();
    expect(deleteBlock({ ...ok, account: false })).toBe("demo");
    expect(deleteBlock({ ...ok, unsent: 1 })).toBe("unsent");
    expect(deleteBlock({ ...ok, fresh: false })).toBe("code");
    expect(deleteBlock({ ...ok, undecided: 1 })).toBe("companies");
    expect(deleteBlock({ ...ok, wordOk: false })).toBe("word");
  });
});

describe("unit:deleteAccount — the answer and the repeat (§6.12)", () => {
  it("reads the edge function's answers", () => {
    expect(readDeleteAnswer(200, { deleted: true, auth: "done" })).toEqual({ kind: "done", pending: false });
    expect(readDeleteAnswer(200, { deleted: true, auth: "pending" })).toEqual({ kind: "done", pending: true });
    expect(readDeleteAnswer(400, { error: "the company keeps at least one active owner", detail: "co-1" })).toEqual({ kind: "refused", key: "acct.err.lastOwner", companyId: "co-1" });
    expect(readDeleteAnswer(401, { msg: "Invalid JWT" })).toEqual({ kind: "refused", key: "acct.err.signIn" });
    expect(readDeleteAnswer(500, { error: "account deletion failed" })).toEqual({ kind: "unknown" });
    expect(readDeleteAnswer(null, null)).toEqual({ kind: "unknown" });
  });
  /** answers in turn; `states` — what the server says about the profile when asked (verify), in turn */
  const run = async (answers: { status: number | null; body: unknown }[], states: AccountState[] = ["unknown"]) => {
    let i = 0;
    let j = 0;
    const out = await deleteWithRepeat(
      async () => {
        const a = answers[Math.min(i++, answers.length - 1)]!;
        if (a.status === null) throw new Error("Failed to fetch");
        return a;
      },
      async () => states[Math.min(j++, states.length - 1)]!,
      async () => {},
    );
    return { out, n: i, asked: j };
  };
  const done = { status: 200, body: { deleted: true, auth: "done" } };
  const pending = { status: 200, body: { deleted: true, auth: "pending" } };
  const lost = { status: 500, body: { error: "account deletion failed" } };
  const net = { status: null, body: null };
  const gate401 = { status: 401, body: { error: "sign in first" } };
  it("done at once — one call, nothing asked", async () => expect(await run([done])).toEqual({ out: { ok: true }, n: 1, asked: 0 }));
  it("500 (the answer lost) → asked: gone → done", async () => expect((await run([lost], ["gone"])).out).toEqual({ ok: true }));
  it("500 → asked: unknown → again → repeat answers done", async () => expect(await run([lost, done], ["unknown"])).toMatchObject({ out: { ok: true }, n: 2 }));
  it("pending → again → done", async () => expect(await run([pending, done])).toMatchObject({ out: { ok: true }, n: 2 }));
  it("pending for ever → still done (the data is closed; the next sign-in finishes it)", async () => expect((await run([pending])).out).toEqual({ ok: true }));
  it("review №1: no answer → 401 (the sign-in is closed) → asked: gone → done, the device is wiped", async () => {
    expect((await run([net, gate401], ["unknown", "gone"])).out).toEqual({ ok: true });
  });
  it("review №5: 500 (the RPC really failed) → 401 → asked: alive → «войдите», never a false «удалён»", async () => {
    expect((await run([lost, gate401], ["alive", "alive"])).out).toEqual({ ok: false, key: "acct.err.signIn" });
  });
  it("review №5: a 400 after a 500 is the real reason", async () => {
    expect((await run([lost, { status: 400, body: { error: "the company keeps at least one active owner", detail: "co-9" } }], ["alive"])).out).toEqual({ ok: false, key: "acct.err.lastOwner", companyId: "co-9" });
  });
  it("our refusal (400 OD001) — no repeat, nothing asked", async () => {
    expect(await run([{ status: 400, body: { error: "type the word to confirm" } }])).toEqual({ out: { ok: false, key: "acct.err.word" }, n: 1, asked: 0 });
  });
  it("the first 401 and the profile alive — «войдите»", async () => expect((await run([gate401], ["alive"])).out).toEqual({ ok: false, key: "acct.err.signIn" }));
  it("500 for ever → «try again», no network for ever → «нет связи» (never «failed for good»)", async () => {
    expect((await run([lost], ["unknown"])).out).toEqual({ ok: false, key: "acct.err.retry" });
    expect((await run([net], ["unknown"])).out).toEqual({ ok: false, key: "acct.err.network" });
  });
  it("out of tries but the last ask says gone → done", async () => {
    expect((await run([lost], ["unknown", "unknown", "unknown", "unknown", "gone"])).out).toEqual({ ok: true });
  });
});

describe("unit:deleteAccount — when the sign-in asks «is it deleted» (review №2, №3)", () => {
  it("once per person: a new SIGNED_IN asks first; the same person again (tab focus, refresh) — as before", () => {
    expect(authEventPlan("SIGNED_IN", "u1", null)).toBe("first");
    expect(authEventPlan("SIGNED_IN", "u1", "u1")).toBe("plain");
    expect(authEventPlan("TOKEN_REFRESHED", "u1", "u1")).toBe("plain");
    expect(authEventPlan("SIGNED_IN", "u2", "u1")).toBe("first");
  });
  it("INITIAL_SESSION does nothing (the start asks first through getSession); signed out — nothing", () => {
    expect(authEventPlan("INITIAL_SESSION", "u1", null)).toBe("none");
    expect(authEventPlan("SIGNED_OUT", null, "u1")).toBe("none");
  });
});

describe("unit:deleteAccount — the device is wiped", () => {
  const keys = ["octo.cloud.v1.co-1", "octo.cloud.v1.co-2", "octo.outbox.v1", "octo.queue.v1", "octo.role.v1", "octo.planWho.v1", "octo.nav.open.u1", "octo.invite.token.v1", "octo.legal.pending.v1", "octo.theme.v1", "octo.lang.v1", "octo.db.v5"];
  const store = (fail = false) => {
    const st = { removed: [] as string[], set: {} as Record<string, string>, gone: [] as string[] };
    return {
      st,
      getAllKeys: async () => keys,
      multiRemove: async (k: string[]) => {
        if (fail) throw new Error("disk full");
        st.removed = k;
      },
      setItem: async (k: string, v: string) => void (st.set[k] = v),
      removeItem: async (k: string) => void st.gone.push(k),
    };
  };
  it("every company's cache, the outbox, the queue, the role, the Plan's person, the menu, the invite, the consent tick", async () => {
    const s = store();
    expect(await wipeDevice(s)).toBe(true);
    expect(s.st.removed.sort()).toEqual(keys.filter(isDeviceKey).sort());
    for (const k of ["octo.theme.v1", "octo.lang.v1", "octo.db.v5"]) expect(s.st.removed).not.toContain(k); // the device's own
    expect(s.st.gone).toContain(WIPE_PENDING_KEY);
  });
  it("review #220 №6: a failed wipe is not swallowed — logged and marked for the next start", async () => {
    const s = store(true);
    const log: string[] = [];
    expect(await wipeDevice(s, (m) => log.push(m))).toBe(false);
    expect(log[0]).toMatch(/disk full/);
    expect(s.st.set[WIPE_PENDING_KEY]).toBe("1");
  });
  it("review #240 №2: the mark keeps the deleted person's id, so the repeat knows whose ops leave the outbox", async () => {
    const s = store(true);
    expect(await wipeDevice(s, () => {}, "u1")).toBe(false);
    expect(s.st.set[WIPE_PENDING_KEY]).toBe("u1");
  });
});

describe("unit:deleteAccount — rate limits (review #220 №3)", () => {
  it("Supabase's «only request this after N seconds» / «email rate limit exceeded» / 429 → their own words, in both places", () => {
    for (const m of ["For security purposes, you can only request this after 52 seconds.", "email rate limit exceeded"]) {
      expect(accountErrorKey(m)).toBe("acct.err.rateLimit");
      expect(codeErrorKey(m)).toBe("acct.err.rateLimit");
    }
    expect(accountErrorKey("", 429)).toBe("acct.err.rateLimit");
  });
  it("«Проверить код»: a wrong or old code — «Код не подошёл»; no network — «нет связи»", () => {
    expect(codeErrorKey("Token has expired or is invalid")).toBe("acct.err.code");
    expect(codeErrorKey("something odd")).toBe("acct.err.code");
    expect(codeErrorKey("Failed to fetch")).toBe("acct.err.network");
  });
});

describe("unit:deleteAccount — «is it deleted» on start (review #220 №1, №5, №8)", () => {
  const make = (answers: (Gone | Error)[]) => {
    let i = 0;
    const asked: string[] = [];
    const goneFor: string[] = [];
    const c = goneChecker(
      async (uid) => {
        asked.push(uid);
        const a = answers[Math.min(i++, answers.length - 1)]!;
        if (a instanceof Error) throw a;
        return a;
      },
      (uid) => goneFor.push(uid),
    );
    return { c, asked, goneFor };
  };
  it("with active memberships nothing is asked (only without them, §6.10)", async () => {
    const m = make([true]);
    expect(await m.c.run("u1", true)).toBe(false);
    expect(m.asked).toEqual([]);
  });
  it("a start without the network: «no answer» is not kept — the retry asks again and finds it deleted", async () => {
    const m = make([null, new Error("timeout"), true]);
    expect(await m.c.run("u1", false)).toBeNull();
    expect(await m.c.run("u1", false)).toBeNull();
    expect(await m.c.run("u1", false)).toBe(true);
    expect(m.asked.length).toBe(3);
    expect(m.goneFor).toEqual(["u1"]);
  });
  it("an event before getSession (web): one question at a time, one «удалён» (one toast)", async () => {
    const m = make([true]);
    const [a, b] = await Promise.all([m.c.run("u1", false), m.c.run("u1", false)]);
    expect([a, b]).toEqual([true, true]);
    expect(m.asked.length).toBe(1);
    expect(m.goneFor).toEqual(["u1"]);
    expect(await m.c.run("u1", false)).toBe(true); // kept: not asked again
    expect(m.asked.length).toBe(1);
  });
  it("alive is kept (no question on every tab focus); after sign-out it is asked afresh", async () => {
    const m = make([false, false]);
    await m.c.run("u1", false);
    await m.c.run("u1", false);
    expect(m.asked.length).toBe(1);
    m.c.forget();
    await m.c.run("u1", false);
    expect(m.asked.length).toBe(2);
  });
});

describe("unit:deleteAccount — one tap, and what the screen does (review #220 №4)", () => {
  it("two quick taps run the action once; after it ends — again", async () => {
    const once = makeOnce();
    let n = 0;
    let release: () => void = () => {};
    const act = once(() => new Promise<void>((r) => ((n += 1), (release = r))));
    const a = act();
    const b = act();
    release();
    await Promise.all([a, b]);
    expect(n).toBe(1);
    const c = act();
    release();
    await c;
    expect(n).toBe(2);
  });
  it("the outcome → the screen: done; old code → back to the code; a company named → highlighted and undecided; unsettled → «Повторить»", () => {
    expect(afterDelete({ ok: true })).toMatchObject({ done: true, toast: null });
    expect(afterDelete({ ok: false, key: "acct.err.fresh" })).toMatchObject({ done: false, resetFresh: true, failed: false, blocked: null, toast: "acct.err.fresh" });
    expect(afterDelete({ ok: false, key: "acct.err.transferFirst", companyId: "co-1" })).toMatchObject({ blocked: "co-1", reloadCompanies: true });
    expect(afterDelete({ ok: false, key: "acct.err.lastOwner", companyId: "co-2" })).toMatchObject({ blocked: "co-2", reloadCompanies: true });
    expect(afterDelete({ ok: false, key: "acct.err.retry" })).toMatchObject({ failed: true });
    expect(afterDelete({ ok: false, key: "acct.err.network" })).toMatchObject({ failed: true });
    expect(afterDelete({ ok: false, key: "acct.err.word" })).toMatchObject({ failed: false, resetFresh: false, blocked: null });
  });
});

describe("unit:deleteAccount — a broken outbox copy leaves with the account (review of #910 №1)", () => {
  it("octo.broken.* is a device key", () => {
    expect(isDeviceKey("octo.broken.octo.outbox.v1.1700000000000")).toBe(true);
  });
});

describe("unit:deleteAccount — the mark of a wipe to repeat (#911)", () => {
  it("«<id>» / «1»: the whole wipe; «filter:<id>[,<id>…]»: only the shared outbox, for every person listed", () => {
    expect(pendingOf("u1")).toEqual({ userId: "u1", userIds: ["u1"], filterOnly: false });
    expect(pendingOf("1")).toEqual({ userId: null, userIds: [null], filterOnly: false });
    expect(pendingOf("filter:u1")).toEqual({ userId: "u1", userIds: ["u1"], filterOnly: true });
    expect(pendingOf("filter:u0,u1")).toEqual({ userId: "u0", userIds: ["u0", "u1"], filterOnly: true });
    expect(pendingOf("filter:1")).toEqual({ userId: null, userIds: [null], filterOnly: true });
    expect(filterMark(["u0", "u1", "u1"])).toBe("filter:u0,u1");
    expect(filterMark([null])).toBe("filter:1");
    expect(wipeMark(["u1", "u0", null])).toBe("u1,u0,1");
    expect(pendingOf("u1,u0")).toEqual({ userId: "u1", userIds: ["u1", "u0"], filterOnly: false });
  });
  it("wipeDevice never removes the keys it is told to keep", async () => {
    const st = new Map([["octo.outbox.v1", "[]"], ["octo.cloud.v1.rejected", "[]"], ["octo.cloud.v1.c1", "x"], ["octo.lang.v1", "ru"]]);
    const store = {
      getAllKeys: async () => [...st.keys()],
      multiRemove: async (ks: string[]) => ks.forEach((k) => st.delete(k)),
      setItem: async (k: string, v: string) => void st.set(k, v),
      removeItem: async (k: string) => void st.delete(k),
    };
    expect(await wipeDevice(store, () => {}, "u1", ["octo.outbox.v1", "octo.cloud.v1.rejected"])).toBe(true);
    expect([...st.keys()].sort()).toEqual(["octo.cloud.v1.rejected", "octo.lang.v1", "octo.outbox.v1"]);
  });
});

describe("unit:deleteAccount — «the device is wiped already» (#1013)", () => {
  it("covers a whole-wipe mark only when it names every person in it; never a «filter:» mark", () => {
    expect(wipedAlready("u1", "u1")).toBe(true);
    expect(wipedAlready("u1,u0", "u0,u1")).toBe(true);
    expect(wipedAlready("u1,u0", "u1")).toBe(false);
    expect(wipedAlready("u1", null)).toBe(false);
    expect(wipedAlready("filter:u1", "u1")).toBe(false);
    expect(wipedAlready("1", "1")).toBe(true);
  });
});
