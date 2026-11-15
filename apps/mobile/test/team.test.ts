/** unit:team — «Команда» и приглашение (wave 7-2, S21; docs/specs/13 §3.13, 19 §2 п.3–4). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB, Member } from "../src/data/types";
import { canDisable, dbRoleFor, INVITE_ROLES, inviteLink, isInviteToken, rememberInvite, takeInvite, teamErrorKey, teamList, teamState, validInviteEmail } from "../src/features/team";

const db = makeSeed() as DB;
const NOW = Date.parse("2026-11-06T12:00:00Z");

describe("unit:team — the invitation", () => {
  it("one role, the server's name for it; owner is never invited", () => {
    expect(INVITE_ROLES).toEqual(["tech", "sales", "dispatcher", "director"]);
    expect(dbRoleFor("director", "employee")).toBe("admin");
    expect(dbRoleFor("dispatcher", "employee")).toBe("office");
    expect(dbRoleFor("sales", "employee")).toBe("sales");
    expect(dbRoleFor("tech", "employee")).toBe("tech");
    expect(dbRoleFor("director", "sub")).toBe("subcontractor");
  });
  it("the link carries the token once, on our site", () => {
    expect(inviteLink("https://gorix.expo.app/", "abc_DEF-123")).toBe("https://gorix.expo.app/auth/invite?token=abc_DEF-123");
    expect(isInviteToken("a".repeat(48))).toBe(true);
    expect(isInviteToken("short")).toBe(false);
    expect(isInviteToken("x".repeat(30) + "<script>")).toBe(false);
  });
  it("an email: something@domain.tld", () => {
    expect(validInviteEmail(" nina@example.com ")).toBe(true);
    for (const e of ["", "nina", "nina@", "nina@example", "a b@c.d"]) expect(validInviteEmail(e), e).toBe(false);
  });
  it("the link waits through sign-in once, then is gone", async () => {
    const mem = new Map<string, string>();
    const store = { setItem: async (k: string, v: string) => void mem.set(k, v), getItem: async (k: string) => mem.get(k) ?? null, removeItem: async (k: string) => void mem.delete(k) };
    await rememberInvite("bad", store);
    expect(await takeInvite(store)).toBeNull();
    await rememberInvite("t".repeat(48), store);
    expect(await takeInvite(store)).toBe("t".repeat(48));
    expect(await takeInvite(store)).toBeNull();
  });
});

describe("unit:team — the list and its states", () => {
  const pending: Member = { id: "inv-1", invitationId: "1", name: "Nina", initials: "N", kind: "employee", roles: ["tech"], pending: true, expiresAt: "2026-11-10T00:00:00Z" };
  const expired: Member = { ...pending, id: "inv-2", expiresAt: "2026-11-01T00:00:00Z" };
  const off: Member = { id: "m-off", name: "Off", initials: "O", kind: "employee", roles: ["tech"], disabled: true, pending: true };
  const d: DB = { ...db, members: [off, pending, ...db.members, expired] };
  it("pending · expired by its date · disabled · active", () => {
    expect(teamState(pending, NOW)).toBe("pending");
    expect(teamState(expired, NOW)).toBe("expired");
    expect(teamState(off, NOW)).toBe("disabled");
    expect(teamState(db.members[0]!, NOW)).toBe("active");
  });
  it("people at work first, then invited, then switched off; their order kept", () => {
    const ids = teamList(d, NOW).map((m) => m.id);
    expect(ids).toEqual([...db.members.map((m) => m.id), "inv-1", "inv-2", "m-off"]);
  });
  it("a switched-off person keeps the name for old records and is out of every picker (pickers filter `pending`)", () => {
    expect(d.members.find((m) => m.id === "m-off")!.name).toBe("Off");
    expect(d.members.filter((m) => m.roles.includes("tech") && !m.pending).some((m) => m.id === "m-off")).toBe(false);
  });
  it("switch off: the owner/admin, not oneself, not a pending one, the owner only by the owner", () => {
    const me = db.members.find((m) => m.id === db.me)!;
    const other = db.members.find((m) => m.id !== db.me && !m.pending)!;
    expect(canDisable(db, db.me, other)).toBe(true);
    expect(canDisable(db, db.me, me)).toBe(false);
    expect(canDisable(d, db.me, pending)).toBe(false);
    const ownerOther = { ...other, isOwner: true };
    const asAdmin: DB = { ...db, members: db.members.map((m) => (m.id === db.me ? { ...m, isOwner: false } : m)) };
    expect(canDisable(asAdmin, db.me, ownerOther)).toBe(false);
    // the last active owner stays
    const lone: DB = { ...db, members: db.members.map((m) => ({ ...m, isOwner: m.id === other.id })) };
    expect(canDisable(lone, db.me, lone.members.find((m) => m.id === other.id)!)).toBe(false);
    const tech = db.members.find((m) => m.id !== db.me && !m.roles.includes("director"));
    if (tech) expect(canDisable(db, tech.id, other)).toBe(false);
  });
});

describe("unit:team — server refusals in the app's words (rule 7)", () => {
  it("each refusal of the team functions has its own message; anything else — a generic one", () => {
    expect(teamErrorKey("this invitation is for another email")).toBe("team.err.otherEmail");
    expect(teamErrorKey("the invitation has expired")).toBe("team.err.expired");
    expect(teamErrorKey("already on the team")).toBe("team.err.already");
    expect(teamErrorKey("confirm your email first")).toBe("team.err.confirm");
    expect(teamErrorKey("no such invitation")).toBe("team.err.noInvite");
    expect(teamErrorKey("the company keeps at least one active owner")).toBe("team.err.lastOwner");
    expect(teamErrorKey("only the owner or an admin invites")).toBe("team.err.rights");
    expect(teamErrorKey("Failed to fetch")).toBe("team.err.generic");
  });
});
