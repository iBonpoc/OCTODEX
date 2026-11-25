/**
 * #2097 (founder 18.11, audit КЛ-09): «Позже» in «Разбор дел» puts a reason off until a chosen day, for the company; it
 * comes back by itself at 00:00 of that day in the company's zone. The same filter for «Требует внимания» and «Ещё».
 */
import { describe, expect, it } from "vitest";
import { buildAttention } from "../src/features/attention";
import { canSnoozeTo, isSnoozed, pickMin, snoozeDay, snoozeUntil, withSnooze } from "../src/features/attentionSnooze";
import { moreCounts } from "../src/features/moreCounts";
import { makeSeed } from "../src/data/seed";

const LA = "America/Los_Angeles";
// 18.11.2026 16:00 in Los Angeles (00:00 UTC on the 19th — the UTC day is already the next one)
const NOW = Date.parse("2026-11-19T00:00:00Z");

describe("«Позже» до даты (#2097)", () => {
  it("the days are the company's: tomorrow / 3 days / a week from the LA day, not the UTC one", () => {
    expect(snoozeDay(1, NOW, LA)).toBe("2026-11-19");
    expect(snoozeDay(3, NOW, LA)).toBe("2026-11-21");
    expect(snoozeDay(7, NOW, LA)).toBe("2026-11-25");
    // back at 00:00 of that day in LA (08:00 UTC in November)
    expect(snoozeUntil("2026-11-19", LA)).toBe("2026-11-19T08:00:00.000Z");
  });
  it("С1 a reason put off is not in «Требует внимания» and not counted on «Ещё»", () => {
    const db = makeSeed();
    const all = buildAttention(db, "director", NOW);
    const it0 = all.find((x) => x.kind === "schedule") ?? all[0]!;
    const d = withSnooze(db, it0.id, snoozeUntil(snoozeDay(1, NOW, LA), LA));
    expect(buildAttention(d, "director", NOW).some((x) => x.id === it0.id)).toBe(false);
    expect(buildAttention(d, "director", NOW)).toHaveLength(all.length - 1);
    if (it0.kind === "schedule") expect(moreCounts(d, "director", NOW, LA).jobs?.n ?? 0).toBe((moreCounts(db, "director", NOW, LA).jobs?.n ?? 0) - 1);
  });
  it("С2 on its day it is back by itself", () => {
    const db = makeSeed();
    const it0 = buildAttention(db, "director", NOW)[0]!;
    const until = snoozeUntil(snoozeDay(1, NOW, LA), LA);
    const d = withSnooze(db, it0.id, until);
    expect(isSnoozed(d, it0.id, Date.parse(until) - 1)).toBe(true);
    expect(isSnoozed(d, it0.id, Date.parse(until))).toBe(false);
    expect(buildAttention(d, "director", Date.parse(until) + 60_000).some((x) => x.id === it0.id)).toBe(true);
  });
  it("С3 «Отменить» / back now (until null): back at once; one entry per reason, the last wins", () => {
    const db = makeSeed();
    const id = buildAttention(db, "director", NOW)[0]!.id;
    let d = withSnooze(db, id, "2026-11-25T08:00:00.000Z");
    d = withSnooze(d, id, "2026-11-21T08:00:00.000Z");
    expect(d.attentionSnoozes).toEqual([{ itemId: id, until: "2026-11-21T08:00:00.000Z" }]);
    d = withSnooze(d, id, null);
    expect(d.attentionSnoozes).toEqual([]);
    expect(isSnoozed(d, id, NOW)).toBe(false);
  });
  it("old saved data with no list: nothing is put off", () => {
    const db = { ...makeSeed(), attentionSnoozes: undefined };
    expect(isSnoozed(db, "sch-x", NOW)).toBe(false);
  });
});

describe("«Позже» → «Выбрать дату…» (#2123)", () => {
  it("С2 the first day to pick is the company's tomorrow (the LA day, not the UTC one)", () => {
    // NOW is 16:00 on the 18th in LA, already the 19th in UTC: tomorrow is the 19th
    expect(pickMin(NOW, LA)).toBe("2026-11-19");
  });
  it("С2 today and the past cannot be picked; tomorrow and later can", () => {
    expect(canSnoozeTo("2026-11-18", NOW, LA)).toBe(false);
    expect(canSnoozeTo("2026-11-01", NOW, LA)).toBe(false);
    expect(canSnoozeTo("2026-11-19", NOW, LA)).toBe(true);
    expect(canSnoozeTo("2026-11-28", NOW, LA)).toBe(true);
  });
  it("С2 at the company's midnight the edge moves with it", () => {
    const justBefore = Date.parse("2026-11-19T07:59:00Z"); // 23:59 on the 18th in LA
    const justAfter = Date.parse("2026-11-19T08:01:00Z"); // 00:01 on the 19th in LA
    expect(canSnoozeTo("2026-11-19", justBefore, LA)).toBe(true);
    expect(canSnoozeTo("2026-11-19", justAfter, LA)).toBe(false);
    expect(pickMin(justAfter, LA)).toBe("2026-11-20");
  });
  it("С1 ten days on: back at 00:00 of that day in the company's zone", () => {
    const day = snoozeDay(10, NOW, LA);
    expect(day).toBe("2026-11-28");
    expect(canSnoozeTo(day, NOW, LA)).toBe(true);
    expect(snoozeUntil(day, LA)).toBe("2026-11-28T08:00:00.000Z");
  });
});
