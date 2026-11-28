/** #2997, спека 68 В8 (в): срок «Напомнить» у отправленной сметы — настройка компании remindDays, отсчёт от отправки */
import { describe, expect, it } from "vitest";
import { estimateRemind } from "../src/features/estimateRemind";

const NOW = Date.parse("2026-11-27T20:00:00Z");
const ago = (d: number, h = 0) => new Date(NOW - d * 86_400_000 - h * 3_600_000).toISOString();

describe("estimateRemind (#2997, В8)", () => {
  it("only a sent estimate with a date of sending", () => {
    expect(estimateRemind({ status: "draft", sentAt: ago(5) }, 3, NOW)).toBeNull();
    expect(estimateRemind({ status: "approved", sentAt: ago(5) }, 3, NOW)).toBeNull();
    expect(estimateRemind({ status: "sent" }, 3, NOW)).toBeNull();
  });
  it("before the term — quiet; on the day of the term and after — overdue", () => {
    expect(estimateRemind({ status: "sent", sentAt: ago(0, 2) }, 3, NOW)).toEqual({ days: 0, overdue: false });
    expect(estimateRemind({ status: "sent", sentAt: ago(2, 23) }, 3, NOW)).toEqual({ days: 2, overdue: false });
    expect(estimateRemind({ status: "sent", sentAt: ago(3) }, 3, NOW)).toEqual({ days: 3, overdue: true });
    expect(estimateRemind({ status: "sent", sentAt: ago(6) }, 3, NOW)).toEqual({ days: 6, overdue: true });
  });
  it("a term of 0 never makes a just-sent estimate overdue", () => {
    expect(estimateRemind({ status: "sent", sentAt: ago(0, 1) }, 0, NOW)?.overdue).toBe(false);
  });
});
