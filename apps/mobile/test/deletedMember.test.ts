/**
 * unit:deletedMember — a person who deleted their account (wave 7а-2b, story map S22; docs/specs/19 §6.10–§6.11).
 * Their records stay with the company: they are «Удалённый пользователь» on screen, off the team and every picker, and a
 * visit with only them is «Не назначено» everywhere (one rule: liveAssignees). An assignment keeps only people at work,
 * or the server refuses it (assign_visit: «only an active member…») — this failed before 7а-2b for disabled people too.
 */
import { describe, expect, it, vi } from "vitest";
// repo.ts pulls the supabase client (react-native): not needed for the pure mapping
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
import { makeSeed } from "../src/data/seed";
import type { DB, Member, Visit } from "../src/data/types";
import { deletedMembers } from "../src/cloud/repo";
import { keepableAssignees, lateKind, liveAssignees, unassignedSoon, visitWho } from "../src/features/schedule";
import { memberLabel, memberName, teamList } from "../src/features/team";
import { buildAttention } from "../src/features/attention";
import { leadTimeline } from "../src/features/leads";
import { commsLog } from "../src/features/comms/comms";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

const GONE: Member = { id: "m-gone", name: "", initials: "—", kind: "employee", roles: ["tech"], pending: true, deleted: true };
const tOf = (d: Record<string, string>) => (k: "acct.deletedName") => d[k]!;

function withGone(): DB {
  const db = makeSeed() as DB;
  db.members = [...db.members, GONE];
  return db;
}

describe("unit:deletedMember — the name", () => {
  it("«Удалённый пользователь» in the viewer's language; the data keeps no name", () => {
    const db = withGone();
    expect(memberName(db, "m-gone", tOf(ru))).toBe("Удалённый пользователь");
    expect(memberName(db, "m-gone", tOf(en))).toBe("Deleted user");
    expect(memberName(db, "m-gone", tOf(es))).toBe("Usuario eliminado");
    expect(memberName(db, "m-gone", "X")).toBe("X");
    expect(db.members.find((m) => m.id === "m-gone")!.name).toBe("");
  });
  it("others keep their name; unknown or empty id → undefined (so `?? fallback` works)", () => {
    const db = withGone();
    expect(memberName(db, "m-ivan", tOf(ru))).toBe("Ivan Sokolov");
    expect(memberName(db, "nobody", tOf(ru))).toBeUndefined();
    expect(memberName(db, null, tOf(ru))).toBeUndefined();
    expect(memberLabel(undefined, "X")).toBeUndefined();
  });
  it("history and the calls log name them too", () => {
    const db = withGone();
    const l = db.leads[0]!;
    db.activities = [
      ...db.activities,
      { id: "a-gone", kind: "assigned", subjectType: "lead", subjectId: l.id, actorId: "m-alex", at: new Date().toISOString(), meta: { to: "m-gone" } } as DB["activities"][number],
      { id: "c-gone", kind: "call", subjectType: "lead", subjectId: l.id, actorId: "m-gone", at: new Date().toISOString() } as DB["activities"][number],
    ];
    const tl = leadTimeline(db, l, db.me, "Удалённый пользователь").find((e) => e.id === "a-gone");
    expect(tl?.params?.name).toBe("Удалённый пользователь");
    expect(commsLog(db, "director", "calls", "Удалённый пользователь").find((c) => c.id === "c-gone")?.by).toBe("Удалённый пользователь");
  });
});

describe("unit:deletedMember — the cloud read", () => {
  it("deleted memberships → pending + deleted, no name, once, never over a person at work", () => {
    const out = deletedMembers([{ user_id: "u1", role: "tech" }, { user_id: "u1", role: "tech" }, { user_id: "u2", role: "subcontractor" }, { user_id: "u3", role: "office" }], new Set(["u3"]));
    expect(out.map((m) => m.id)).toEqual(["u1", "u2"]);
    expect(out.every((m) => m.deleted && m.pending && m.name === "")).toBe(true);
    expect(out[1]!.kind).toBe("sub");
  });
});

describe("unit:deletedMember — the team", () => {
  it("not on «Команда»", () => {
    expect(teamList(withGone()).some((m) => m.id === "m-gone")).toBe(false);
  });
});

describe("unit:deletedMember — «Не назначено» is one rule", () => {
  const NOW = Date.now();
  const visitOnlyGone = (db: DB): Visit => {
    const v = db.visits.find((x) => x.id === "v6")!;
    const start = new Date(NOW - 60 * 60_000).toISOString(); // an hour ago: would be «late» if someone counted
    Object.assign(v, { techId: "m-gone", assigneeIds: ["m-gone"], start, step: "scheduled", closed: false });
    return v;
  };
  it("liveAssignees drops the deleted, keeps the rest; without members — everyone", () => {
    const db = withGone();
    expect(liveAssignees({ techId: "m-gone", assigneeIds: ["m-gone", "m-ivan"] }, db.members)).toEqual(["m-ivan"]);
    expect(liveAssignees({ techId: "m-gone", assigneeIds: ["m-gone"] })).toEqual(["m-gone"]);
  });
  it("a visit with only a deleted account: unassigned today, not «late», no late tech", () => {
    const db = withGone();
    const v = visitOnlyGone(db);
    expect(unassignedSoon(db, NOW, "UTC").some((x) => x.v.id === v.id)).toBe(true);
    expect(lateKind(v, NOW, 15, db.members)).toBeNull();
    expect(lateKind(v, NOW, 15)).not.toBeNull(); // the old rule: this is what showed «опаздывает»
    expect(visitWho(db, v).tech).toBe("");
  });
  it("«Требует внимания»: «Выезд без мастера», never «опаздывает» for it", () => {
    const db = withGone();
    db.company = { ...db.company, timezone: "UTC" } as DB["company"];
    const v = visitOnlyGone(db);
    const att = buildAttention(db, "director", NOW);
    expect(att.some((a) => a.kind === "unassigned" && a.refId === v.id)).toBe(true);
    expect(att.some((a) => a.kind === "late" && a.refId === v.id)).toBe(false);
  });
});

describe("unit:deletedMember — an assignment keeps only people at work", () => {
  it("a deleted or switched-off person is not kept (the server would refuse the whole change)", () => {
    const db = withGone();
    db.members = [...db.members, { id: "m-off", name: "Off", initials: "O", kind: "employee", roles: ["tech"], pending: true, disabled: true }];
    expect(keepableAssignees(["m-gone", "m-ivan", "m-off"], db.members)).toEqual(["m-ivan"]);
  });
});
