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
import { hiddenAssignees, keepableAssignees, lateKind, liveAssignees, moveAssignee, unassignedSoon, visitWho } from "../src/features/schedule";
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
  // a fixed noon UTC: «today» never crosses midnight in the run (review #216 №4)
  const NOW = Date.parse("2026-11-06T12:00:00Z");
  const OFF: Member = { id: "m-off", name: "Off Person", initials: "OP", kind: "employee", roles: ["tech"], pending: true, disabled: true };
  const only = (db: DB, who: string): Visit => {
    const v = db.visits.find((x) => x.id === "v6")!;
    const start = new Date(NOW - 60 * 60_000).toISOString(); // an hour ago: «late» if anyone counted
    Object.assign(v, { techId: who, assigneeIds: [who], start, step: "scheduled", closed: false });
    return v;
  };
  const withBoth = () => {
    const db = withGone();
    db.members = [...db.members, OFF];
    db.company = { ...db.company, timezone: "UTC" } as DB["company"];
    return db;
  };
  it("liveAssignees: only people at work (not deleted, not switched off); an unknown id still counts", () => {
    const db = withBoth();
    expect(liveAssignees({ techId: "m-gone", assigneeIds: ["m-gone", "m-ivan", "m-off", "old-id"] }, db.members)).toEqual(["m-ivan", "old-id"]);
    expect(liveAssignees({ techId: "m-gone", assigneeIds: ["m-gone"] }, [])).toEqual(["m-gone"]);
  });
  for (const who of ["m-gone", "m-off"]) {
    it(`a visit with only ${who}: unassigned today, not «late», no late tech`, () => {
      const db = withBoth();
      const v = only(db, who);
      expect(unassignedSoon(db, NOW, "UTC").some((x) => x.v.id === v.id)).toBe(true);
      expect(lateKind(v, db.members, NOW, 15)).toBeNull();
      expect(lateKind(v, [], NOW, 15)).not.toBeNull(); // without the people it would be «опаздывает» — what showed before
      expect(visitWho(db, v).tech).toBe("");
    });
    it(`«Требует внимания» for ${who}: «Выезд без мастера», never «опаздывает»`, () => {
      const db = withBoth();
      const v = only(db, who);
      const att = buildAttention(db, "director", NOW);
      expect(att.some((a) => a.kind === "unassigned" && a.refId === v.id)).toBe(true);
      expect(att.some((a) => a.kind === "late" && a.refId === v.id)).toBe(false);
    });
  }
});

describe("unit:deletedMember — an assignment keeps only people at work", () => {
  const db = withGone();
  db.members = [...db.members, { id: "m-off", name: "Off", initials: "O", kind: "employee", roles: ["tech"], pending: true, disabled: true }];
  const v = { techId: "m-gone", assigneeIds: ["m-gone", "m-dima", "m-off"] };
  it("the sheet: a deleted or switched-off person is not kept (the server would refuse the whole change)", () => {
    expect(keepableAssignees(["m-gone", "m-ivan", "m-off"], db.members)).toEqual(["m-ivan"]);
    expect(hiddenAssignees(v, db.members)).toEqual(["m-gone", "m-off"]);
  });
  it("the Plan's drag: the dragged person replaced, the others at work stay, the hidden go", () => {
    expect(moveAssignee(v, "m-dima", "m-ivan", db.members)).toEqual(["m-ivan"]);
    expect(moveAssignee({ techId: "m-dima", assigneeIds: ["m-dima", "m-alex"] }, "m-dima", "m-ivan", db.members)).toEqual(["m-alex", "m-ivan"]);
    expect(moveAssignee(v, "none", "m-ivan", db.members)).toEqual(["m-ivan"]);
  });
});

describe("unit:deletedMember — a client's document", () => {
  it("the device person on an approval: «Удалённый пользователь» in the CLIENT's language (rule 7), never empty", async () => {
    const { portalFromEstimate } = await import("../src/cloud/portal");
    const { docLanguageFor } = await import("../src/data/people");
    const { tFor } = await import("../src/i18n/translate");
    const db = withGone();
    const e = db.estimates[0]!;
    e.approval = { optionId: "o", addonIds: [], signerName: "Client", at: "2026-11-06T12:00:00Z", signature: "", totalCents: 100, depositCents: 0, channel: "device", deviceUserId: "m-gone" } as unknown as NonNullable<typeof e.approval>;
    const want = tFor(docLanguageFor(db, { customerId: e.customerId, leadId: e.leadId }))("acct.deletedName");
    expect(want).not.toBe("");
    expect(portalFromEstimate(db, e, "Co").approval?.deviceUser).toBe(want);
  });
});
