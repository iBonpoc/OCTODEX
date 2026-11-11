/** #1104 п.1: the lead's history never shows a raw dictionary key («Статус: st.replied»), in both of its lists. */
import { describe, expect, it } from "vitest";
import { tFor } from "../src/i18n/translate";
import { leadStatusView, timelineText } from "../src/features/leads";
import type { LeadStatus } from "../src/data/types";

const ru = tFor("ru");
const en = tFor("en");
const entry = (to: LeadStatus, reason?: string) => ({
  key: (to === "lost" || to === "declined" ? "tl.closed" : "tl.status") as "tl.closed" | "tl.status",
  params: { status: leadStatusView[to].label as string, reason: reason ? `lead.reason.${reason}` : "" },
});

describe("timelineText — a status change reads as words", () => {
  it("every status of a lead gets a translated word, no key left (ru and en)", () => {
    for (const to of Object.keys(leadStatusView) as LeadStatus[]) {
      for (const t of [ru, en]) {
        const text = timelineText(entry(to), t);
        expect(text, `${to}`).not.toMatch(/\b(st|lead|tl)\.[a-z_]+/);
      }
    }
  });
  it("«На связи» after a reply (the case from the founder's pass)", () => {
    expect(timelineText(entry("replied"), ru)).toBe("Статус: На связи");
  });
  it("a closed lead: the status and, after a colon, the reason", () => {
    const text = timelineText(entry("lost", "price_too_high"), ru);
    expect(text).toMatch(/^Лид закрыт — .+: .+/);
    expect(text).not.toMatch(/lead\.reason/);
    expect(timelineText(entry("lost"), ru)).toMatch(/^Лид закрыт — [^:]+$/);
  });
});

import { remindWording } from "../src/features/leads";
describe("remindWording — «про смету» only when an estimate was sent (#1104 п.2)", () => {
  it("an estimate was sent: «Напомнить про смету» and its text", () => {
    const w = remindWording(true);
    expect(ru(w.label)).toBe("Напомнить про смету");
    expect(ru(w.text, { name: "Анна", title: "Крыша" })).toContain("про смету «Крыша»");
  });
  it("no estimate: neither the button nor the text mentions one, in all three languages", () => {
    const w = remindWording(false);
    for (const t of [ru, en, tFor("es")]) {
      expect(t(w.label)).not.toMatch(/смет|estimate|presupuesto/i);
      expect(t(w.text, { name: "Анна", title: "" })).not.toMatch(/смет|estimate|presupuesto|«»/i);
    }
  });
});

describe("translate — a date that ends with a dot does not make «..» (#1104 п.3)", () => {
  it("«подписал(а) ср, 11 нояб.» + the sentence's dot = one dot", () => {
    const text = ru("est.countersign.clientSigned", { name: "Анна", date: "ср, 11 нояб." });
    expect(text).toContain("нояб. Подпишите");
    expect(text).not.toContain("..");
  });
  it("an ellipsis stays an ellipsis", () => {
    expect(ru("est.countersign.clientSigned", { name: "Анна…", date: "..." })).toContain("...");
  });
});
