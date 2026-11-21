/** The lead's words in the prototype v2 list and object (features/lead/leadRows.ts, #2350 волна 3 Э7). */
import { describe, expect, it } from "vitest";
import type { Lead } from "../src/data/types";
import type { LeadTurn } from "../src/features/leads";
import { fmtWait, leadRowLine, leadStepOf, leadWaitLabel, leadWhat } from "../src/features/lead/leadRows";

const t = (k: string, p?: Record<string, string | number>) => (p ? `${k}(${Object.values(p).join(",")})` : k);
const day = (iso: string) => iso.slice(0, 10);
const lead = (x: Partial<Lead> = {}): Lead => ({ id: "l1", name: "Kevin Brooks", phone: "8185550100", city: "Encino", sourceId: "s1", receivedAt: "2026-11-20T08:00:00Z", message: "", status: "new", ...x }) as Lead;

describe("fmtWait", () => {
  it("minutes, hours and days", () => {
    expect(fmtWait(4, t)).toBe("time.min(4)");
    expect(fmtWait(65, t)).toBe("time.hmin(1,5)");
    expect(fmtWait(3000, t)).toBe("time.days(2)");
  });
});

describe("the row of the list", () => {
  it("the client waits: the pill says how long, the line only «что · город»", () => {
    const turn: LeadTurn = { kind: "reply", minutes: 4, attempts: 0, status: "info" };
    expect(leadWaitLabel(turn, t)).toBe("time.min(4)");
    expect(leadRowLine(lead({ service: "Water heater" }), turn, { t, day })).toBe("Water heater · Encino");
  });
  it("no wait pill when it is not our reply", () => {
    expect(leadWaitLabel({ kind: "wait", days: 3, action: "none", status: "neutral" }, t)).toBeNull();
  });
  it("in work: where it stands first", () => {
    const turn: LeadTurn = { kind: "noStep", status: "warn" };
    expect(leadRowLine(lead({ status: "replied", service: "Interior painting", city: "Arcadia" }), turn, { t, day })).toBe("st.replied · Interior painting · Arcadia");
  });
  it("closed: the reason, not the status word", () => {
    const turn: LeadTurn = { kind: "done", status: "neutral" };
    expect(leadRowLine(lead({ status: "lost", lostReason: "price_too_high", service: "Deck" }), turn, { t, day })).toBe("lead.reason.price_too_high · Deck · Encino");
  });
  it("no service: the first words of the message, cut; nothing at all — the source", () => {
    expect(leadWhat({ message: "Need shelves, a door and a light fixed in the garage please" })).toMatch(/…$/);
    expect(leadRowLine(lead({ city: "" }), { kind: "reply", minutes: 1, attempts: 0, status: "info" }, { t, day, source: "Yelp" })).toBe("Yelp");
  });
});

describe("the one main step (object-cards «Порядок главной»)", () => {
  const o = { servable: true, tech: false };
  it("reply first, even with a client that is not served", () => {
    expect(leadStepOf(lead({ customerId: "c1" }), { kind: "reply", minutes: 2, attempts: 0, status: "info" }, { ...o, servable: false })).toBe("reply");
  });
  it("a client we do not serve → open the client", () => {
    expect(leadStepOf(lead({ status: "replied", customerId: "c1" }), { kind: "noStep", status: "warn" }, { ...o, servable: false })).toBe("client");
  });
  it("no step → «Что дальше?»; waiting → remind, then «Потерян или подождать?»", () => {
    expect(leadStepOf(lead({ status: "replied" }), { kind: "noStep", status: "warn" }, o)).toBe("next");
    expect(leadStepOf(lead({ status: "estimate_sent" }), { kind: "wait", days: 3, action: "remind", status: "warn" }, o)).toBe("remind");
    expect(leadStepOf(lead({ status: "estimate_sent" }), { kind: "wait", days: 20, action: "lostOrWait", status: "warn" }, o)).toBe("lowOrWait");
  });
  it("booked: the office makes the estimate, the tech goes to the tasks", () => {
    const turn: LeadTurn = { kind: "step", status: "warn" };
    expect(leadStepOf(lead({ status: "booked" }), turn, o)).toBe("estimate");
    expect(leadStepOf(lead({ status: "booked" }), turn, { ...o, tech: true })).toBe("tasks");
  });
  it("snoozed → back now; closed → back to work; won → the client", () => {
    expect(leadStepOf(lead({ status: "replied" }), { kind: "snoozed", until: "2026-12-01", status: "neutral" }, o)).toBe("unsnooze");
    expect(leadStepOf(lead({ status: "lost" }), { kind: "done", status: "neutral" }, o)).toBe("reopen");
    expect(leadStepOf(lead({ status: "won", customerId: "c1" }), { kind: "done", status: "ok" }, o)).toBe("client");
    expect(leadStepOf(lead({ status: "won" }), { kind: "done", status: "ok" }, o)).toBeNull();
  });
});
