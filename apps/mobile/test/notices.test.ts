/** unit:notices — the office notice «running late» (docs/specs/03 П3c, решение 5): computed, two texts, gone on site. */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB, Visit } from "../src/data/types";
import { lateNotices } from "../src/features/lateNotice";
import { translate } from "../src/i18n/translate";

const NOW = new Date("2026-11-05T20:00:00.000Z").getTime();
const min = (m: number) => new Date(NOW + m * 60_000).toISOString();
const base = makeSeed();
const prop = base.properties[0]!;
const client = base.customers.find((c) => c.id === prop.customerId)!;
const tech = base.members.find((m) => m.id === "m-ivan")!;
const V = (id: string, p: Partial<Visit>): Visit => ({ id, propertyId: prop.id, techId: "m-ivan", assigneeIds: ["m-ivan"], start: min(-20), durationMin: 60, step: "scheduled", scope: [], checklist: [], photos: [], amountDueCents: 0, ...p });
const db = (visits: Visit[]) => ({ ...base, visits }) as DB;

describe("unit:notices — visit.late", () => {
  it("not left: names the tech, the client and the start", () => {
    const [n] = lateNotices(db([V("a", {})]), "director", NOW);
    expect(n).toMatchObject({ kind: "visit.late", visitId: "a", tech: tech.name, customer: client.name, late: "not_left", lateAt: min(-20) });
  });
  it("on the way: since when the tech left", () => {
    const [n] = lateNotices(db([V("a", { step: "en_route", enRouteAt: min(-10) })]), "dispatcher", NOW);
    expect(n).toMatchObject({ late: "en_route", lateAt: min(-10) });
  });
  it("gone on site and for anyone who does not plan", () => {
    expect(lateNotices(db([V("a", { step: "on_site" })]), "director", NOW)).toEqual([]);
    expect(lateNotices(db([V("a", {})]), "tech", NOW)).toEqual([]);
    expect(lateNotices(db([V("a", {})]), "sales", NOW)).toEqual([]);
  });
  it("the texts, with the time in en-US", () => {
    const p = { tech: "Ivan", client: "Ann Lee", time: "11:40 AM" };
    expect(translate("ru", "late.notice.enRoute", p)).toBe("Ivan опаздывает на Ann Lee, в пути с 11:40 AM");
    expect(translate("ru", "late.notice.notLeft", p)).toBe("Ivan опаздывает на Ann Lee, не выехал · начало 11:40 AM");
    expect(translate("en", "late.notice.enRoute", p)).toBe("Ivan is running late to Ann Lee, on the way since 11:40 AM");
  });
});
