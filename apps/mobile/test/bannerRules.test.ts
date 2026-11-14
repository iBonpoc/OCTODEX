/**
 * `Banner` (DS Б9, §15.3; #957) — the rules behind the component (review of #1436): a change of the title is said ONCE on each
 * platform (iOS — an announcement; Android and the web — the live region; before, Android heard it twice), never on the first
 * show; the tone is said as a word before the title; the «✕» only on an info banner — at run time and in the props' type.
 */
import { describe, expect, it } from "vitest";
import { closable, sayChangeBy, spoken, titleChanged } from "../src/ui/bannerRules";
import type { BannerProps } from "../src/ui/banner";

describe("Banner: how a change is said", () => {
  it("iOS announces; Android and the web read the live region — one voice each, never two", () => {
    expect(sayChangeBy("ios")).toBe("announce");
    expect(sayChangeBy("android")).toBe("live"); // was «announce» too: TalkBack read it twice (live region + announcement)
    expect(sayChangeBy("web")).toBe("live");
  });
  it("only a changed title is said; the first show is not a change", () => {
    expect(titleChanged("Нет в прайсе: 24", "Нет в прайсе: 24")).toBe(false);
    expect(titleChanged("Нет в прайсе: 24", "Тестовые цены: 24")).toBe(true);
  });
  it("the tone's word comes first (rule 2: the tone is said, not only drawn)", () => {
    expect(spoken("Предупреждение", "Модуль не подключён")).toBe("Предупреждение. Модуль не подключён");
  });
});

describe("Banner: the «✕» only on info (§15.3)", () => {
  it("info with somewhere to close to — yes; info without, or any other tone — no", () => {
    expect(closable("info", () => {})).toBe(true);
    expect(closable("info", undefined)).toBe(false);
    for (const t of ["ok", "warn", "bad"] as const) expect(closable(t, () => {})).toBe(false);
  });
  it("the props' type forbids onClose on a warn banner (a mistake is caught by tsc, not silently dropped)", () => {
    const ok: BannerProps = { tone: "info", title: "x", onClose: () => {} };
    // @ts-expect-error — a warn banner cannot be closed
    const bad: BannerProps = { tone: "warn", title: "x", onClose: () => {} };
    expect([ok.tone, bad.tone]).toEqual(["info", "warn"]);
  });
});
