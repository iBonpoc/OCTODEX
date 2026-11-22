/**
 * Prototype v2, wave 3 Э1 (BUILD-PLAN §3): «Главная» of the office (today.tsx) and «Мой день» of the tech (visits.tsx) are the
 * template «Обзор» (BUILD-SPEC §2.1, §2.14; LAYOUT-RULES §3). Guards on the source: the template, one main step in the NowCard,
 * «Требует действия» through the template (≤ 3), the tiles on pastels, nothing own; the proto.home.* words in all three languages.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ru } from "../src/i18n/ru";
import { en } from "../src/i18n/en";
import { es } from "../src/i18n/es";

const src = (p: string) => readFileSync(join(__dirname, "..", "src", p), "utf8");
const today = src("app/(tabs)/today.tsx");
const visits = src("app/(tabs)/visits.tsx");
const cards = src("features/AttentionCards.tsx");
const setup = src("features/SetupCards.tsx");

describe("the two Overviews are the template «Обзор»", () => {
  for (const [name, s] of [["today", today], ["visits", visits]] as const) {
    it(`${name}: OverviewScreen with the NowCard step, the header from useHomeHeader, the greeting`, () => {
      expect(s).toMatch(/<OverviewScreen\b/);
      expect(s).not.toMatch(/<Screen\b/);
      expect(s).toMatch(/\bnext=\{nextCard\}/);
      expect(s).toMatch(/useHomeHeader\(\)/);
      expect(s).toMatch(/useGreeting\(\)/);
    });
    it(`${name}: nothing own — no Button, Press, Card or ListCard on the screen; rows are GroupRow / FigureRow, tiles StatTile`, () => {
      expect(s).not.toMatch(/<(Button|Press|ListCard|CardGrid)\b/);
      expect(s).toMatch(/<(GroupRow|FigureRow)\b/);
      // visual v2 (21.11): a tile carries an icon, no pastel
      expect(s).toMatch(/<StatTile\b[^>]*icon=/);
      expect(s).not.toMatch(/pastel=/);
    });
    it(`${name}: no «appear once per session» animation (LAYOUT-RULES §8 п.1: the home is opened 100 times a day)`, () => {
      expect(s).not.toMatch(/react-native-reanimated/);
    });
  }
  it("the office (v2 макет 1): «Требует действия» is the 2 × 2 tiles under the block's title, «Все ›» opens Triage; the crews are rows of one group (rule 12, #2363 F20)", () => {
    expect(today).toMatch(/<ListGroup title=\{t\("todayR\.action"\)\} all=\{\{.*\/triage.*\bbare\b/);
    expect(today).toMatch(/<ListGroup title=\{t\("proto\.home\.crews"\)\}/);
    expect(today).not.toMatch(/<ListGroup title=\{t\("proto\.home\.crews"\)\}.*\bbare\b/);
    expect(today).toMatch(/<GroupRow\s+key=\{x\.id\}\s+testID="crew-row"/);
  });
  it("the office: four tiles — leads, estimates, owed, received, each with its icon; none yellow (the Home's one yellow is «В пути»)", () => {
    const tiles = [...today.matchAll(/<StatTile testID="(tile-[a-z]+)" icon="([a-zA-Z]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(tiles).toEqual(["tile-leads:leads", "tile-estimates:doc", "tile-owed:dollar", "tile-received:trend"]);
    expect(today).not.toMatch(/<StatTile\b[^>]*\baccent\b/);
  });
  it("the tech: two tiles, his money and his visits; no bell and no company money (BUILD-SPEC §2.14)", () => {
    expect(visits).toMatch(/testID="tile-collected" icon="dollar"/);
    expect(visits).toMatch(/testID="tile-visits"\s+icon="calendar"/);
    expect(visits).not.toMatch(/awaitingCents|receivedIndex|tile-owed/);
    expect(cards).toMatch(/role !== "tech" \? \[\{ icon: "bell"/);
  });
  it("the tech's step: «В пути» before, «Продолжить выезд» on the visit, no button when all is closed", () => {
    expect(visits).toMatch(/proto\.home\.continue/);
    expect(visits).toMatch(/proto\.visit\.enRoute/);
    // the «all closed» card has `empty` and no `main`
    const none = visits.slice(visits.indexOf("if (!focus)"), visits.indexOf("const { customer, property, job }"));
    expect(none).toMatch(/empty:/);
    expect(none).not.toMatch(/main:/);
  });
  it("«В пути» on the Overview is the visit's own step: location question, the step with «Отменить», the SMS", () => {
    const fn = cards.slice(cards.indexOf("export function useEnRoute"), cards.indexOf("export function useHomeHeader"));
    expect(fn).toMatch(/consent\.ask/);
    expect(fn).toMatch(/toast\.show\([^;]*store\.advanceVisit\(v\.id\)\)/);
    expect(fn).toMatch(/enRouteSms/);
  });
  it("the setup cards are grouped rows, not accent cards with progress bars (§8 п.19)", () => {
    expect(setup).toMatch(/<ListGroup\b/);
    expect(setup).not.toMatch(/<(Card|ProgressBar|Button)\b/);
  });
});

describe("proto.home.* words", () => {
  const keys = (d: Record<string, string>) => Object.keys(d).filter((k) => k.startsWith("proto.home.")).sort();
  it("the same keys in ru, en, es, and every key the screens use is there", () => {
    expect(keys(en)).toEqual(keys(ru));
    expect(keys(es)).toEqual(keys(ru));
    const used = new Set([...`${today}${visits}${cards}`.matchAll(/"(proto\.home\.[a-zA-Z.]+)"/g)].map((m) => m[1]!));
    for (const k of used) expect(keys(ru), k).toContain(k);
  });
  it("the same placeholders in every language", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const k of keys(ru)) {
      expect(ph(en[k as keyof typeof en]), k).toBe(ph(ru[k as keyof typeof ru]));
      expect(ph(es[k as keyof typeof es]), k).toBe(ph(ru[k as keyof typeof ru]));
    }
  });
});
