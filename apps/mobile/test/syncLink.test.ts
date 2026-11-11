/** The sync badge: «no network» vs «server unavailable» (docs/specs/23 §3, review #244 №3). */
import { describe, expect, it } from "vitest";
import { badgeState, leavingSummary, MONEY_KINDS, showsSyncLine, stuckKindKey } from "../src/data/syncLink";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

describe("unit:syncLink — what the badge says", () => {
  it("all is well: nothing; the queue going out: sending", () => {
    expect(badgeState(true, "ok", 0)).toBeNull();
    expect(badgeState(true, "ok", 2)).toBe("sending");
  });
  it("no answer at all: offline, with or without a queue", () => {
    expect(badgeState(false, "offline", 0)).toBe("offline");
    expect(badgeState(false, "offline", 3)).toBe("offline");
  });
  it("the server answers «not now»: server unavailable, not «no network»", () => {
    expect(badgeState(false, "server", 0)).toBe("server");
    expect(badgeState(false, "server", 3)).toBe("server");
  });
  it("changes the server keeps refusing «for now»: «not sent: n» — but no network / server unavailable come first", () => {
    expect(badgeState(true, "ok", 3, 1)).toBe("stuck");
    expect(badgeState(true, "ok", 1, 1)).toBe("stuck");
    expect(badgeState(false, "offline", 3, 1)).toBe("offline");
    expect(badgeState(false, "server", 3, 1)).toBe("server");
    expect(badgeState(true, "ok", 2, 0)).toBe("sending");
  });
  it("the words differ in every language and keep the count", () => {
    for (const d of [ru, en, es] as Record<string, string>[]) {
      expect(d["sync.server.badge"]).toContain("{n}");
      expect(d["sync.server.badge"]).not.toBe(d["offline.badge"]);
      expect(d["sync.stuck.badge"]).toContain("{n}");
      expect(d["sync.stuck.sureWaiting"]).toContain("{what}"); // the kinds and counts that leave (review #259)
      expect(d["sync.stuck.leaving"]).toContain("{n}");
    }
  });

  it("what kind of change a stuck op is: by the op's kind; an unknown kind is «a change»", () => {
    expect(stuckKindKey("customer.update")).toBe("sync.kind.customer");
    expect(stuckKindKey("estimate.save")).toBe("sync.kind.estimate");
    expect(stuckKindKey("estimate.deposit")).toBe("sync.kind.money"); // money, not «estimate» (review #259)
    expect(stuckKindKey("visit.pay")).toBe("sync.kind.money");
    expect(stuckKindKey("contact.save")).toBe("sync.kind.company"); // the company's contacts, not a client's
    expect(stuckKindKey("invoice.pay")).toBe("sync.kind.money");
    expect(stuckKindKey("visit.step")).toBe("sync.kind.visit");
    expect(stuckKindKey("whatever.x")).toBe("sync.kind.other");
    for (const d of [ru, en, es] as Record<string, string>[]) for (const k of ["customer", "company", "lead", "estimate", "money", "job", "visit", "task", "other"]) expect(d[`sync.kind.${k}`]).toBeTruthy();
  });
});

describe("unit:syncLink — what leaves with a discarded change (review #259)", () => {
  it("by kind, in order, with the count", () => {
    expect(leavingSummary(["job.create", "invoice.issue", "payment.record", "payment.record"])).toEqual({
      kinds: [{ key: "sync.kind.job", n: 1 }, { key: "sync.kind.money", n: 3 }],
      money: true,
    });
  });
  it("money: payment.record, visit.pay, estimate.deposit, invoice.issue, invoice.pay, expense.add — each alone says so", () => {
    for (const k of ["payment.record", "visit.pay", "estimate.deposit", "invoice.issue", "invoice.pay", "expense.add"]) {
      expect(MONEY_KINDS.has(k)).toBe(true);
      expect(leavingSummary([k]).money).toBe(true);
    }
  });
  it("no money: a job line, a note, a lead change", () => {
    expect(leavingSummary(["jobLine.save", "note.add", "lead.update"]).money).toBe(false);
    expect(leavingSummary([])).toEqual({ kinds: [], money: false });
  });
});

describe("unit:syncLink — «Ещё»: the sync line or «всё сохранено» (A-02, #756)", () => {
  it("the device refused a write: never «всё сохранено», also online with nothing to send", () => {
    expect(showsSyncLine(true, 0, false)).toBe(false);
    expect(showsSyncLine(true, 0, true)).toBe(true);
    expect(showsSyncLine(false, 0, false)).toBe(true);
    expect(showsSyncLine(true, 2, false)).toBe(true);
  });
});
