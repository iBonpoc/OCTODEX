/**
 * unit:deleteAccount — «Удалить аккаунт» in the app (wave 7а-2b, story map S22; docs/specs/19 §6.10–§6.12).
 * The server's texts are taken from migration 20261106200000 (OD001) and supabase/functions/delete-account/handler.ts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  accountErrorKey, CONFIRM_WORD, deleteBlock, deleteWithRepeat, isDeviceKey, lastOwnerCompanies, normalizeWord, readDeleteAnswer, wipeDevice, wordOk,
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
  const run = async (answers: { status: number | null; body: unknown }[]) => {
    let i = 0;
    const calls: number[] = [];
    const out = await deleteWithRepeat(async () => {
      calls.push(i);
      const a = answers[Math.min(i++, answers.length - 1)]!;
      if (a.status === null) throw new Error("Failed to fetch");
      return a;
    }, async () => {});
    return { out, n: calls.length };
  };
  const done = { status: 200, body: { deleted: true, auth: "done" } };
  const pending = { status: 200, body: { deleted: true, auth: "pending" } };
  const lost = { status: 500, body: { error: "account deletion failed" } };
  it("done at once — one call", async () => expect(await run([done])).toEqual({ out: { ok: true }, n: 1 }));
  it("500 (the answer lost) → again → repeat answers done", async () => expect(await run([lost, done])).toEqual({ out: { ok: true }, n: 2 }));
  it("pending → again → done", async () => expect(await run([pending, done])).toEqual({ out: { ok: true }, n: 2 }));
  it("500 → 401: the sign-in is closed already — success", async () => expect(await run([lost, { status: 401, body: {} }])).toEqual({ out: { ok: true }, n: 2 }));
  it("pending for ever → still a success (the data is closed; the next sign-in finishes it)", async () => expect((await run([pending])).out).toEqual({ ok: true }));
  it("our refusal (400 OD001) — no repeat", async () => {
    expect(await run([{ status: 400, body: { error: "type the word to confirm" } }])).toEqual({ out: { ok: false, key: "acct.err.word" }, n: 1 });
  });
  it("the first 401 — not signed in, no repeat", async () => expect(await run([{ status: 401, body: {} }])).toEqual({ out: { ok: false, key: "acct.err.signIn" }, n: 1 }));
  it("500 for ever → «try again», not «failed for good»; no network → «нет связи»", async () => {
    expect((await run([lost])).out).toEqual({ ok: false, key: "acct.err.retry" });
    expect((await run([{ status: null, body: null }])).out).toEqual({ ok: false, key: "acct.err.network" });
  });
});

describe("unit:deleteAccount — the device is wiped", () => {
  it("every company's cache, the outbox, the queue, the role, the Plan's person, the menu, the invite, the consent tick", async () => {
    const keys = ["octo.cloud.v1.co-1", "octo.cloud.v1.co-2", "octo.outbox.v1", "octo.queue.v1", "octo.role.v1", "octo.planWho.v1", "octo.nav.open.u1", "octo.invite.token.v1", "octo.legal.pending.v1", "octo.theme.v1", "octo.lang.v1", "octo.db.v5"];
    let removed: string[] = [];
    await wipeDevice({ getAllKeys: async () => keys, multiRemove: async (k) => void (removed = k) });
    expect(removed.sort()).toEqual(keys.filter(isDeviceKey).sort());
    for (const k of ["octo.theme.v1", "octo.lang.v1", "octo.db.v5"]) expect(removed).not.toContain(k); // the device's own, not the person's
  });
});
