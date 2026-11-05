/** List cards: one order of lines, short facts in pairs, contact buttons in one order (docs/specs/06-list-cards.md «Правила раскладки»). */
import { describe, expect, it } from "vitest";
import {
  FACT_ICON, FACT_ORDER, HALF_MAX, REGULAR_MAX_LINES, contactActions, edgeTone, layoutFacts, mapsUrl, rowColumns, touchPad,
  type FactKey, type FactLine, type Facts,
} from "@/ui/listCardLayout";

const keys = (lines: FactLine[]) => lines.flatMap((l) => ("pair" in l ? l.pair : [l.key]));

describe("fact lines: one order for every card", () => {
  const lead: Facts = { note: "Call after 5", addr: "640 W Dryden St, Glendale, CA 91202", src: "Google LSA — $32.00", phone: "(213) 555-0100", num: "LEA-0229", resp: "Alex Lee" };
  it("the order does not depend on the order the screen passes facts in", () => {
    const shuffled: Facts = Object.fromEntries(Object.entries(lead).reverse());
    expect(keys(layoutFacts(shuffled, "rich", "phone"))).toEqual(keys(layoutFacts(lead, "rich", "phone")));
  });
  it("contacts first (number + phone, email, address), then what, when, who, links", () => {
    expect(keys(layoutFacts(lead, "rich", "phone"))).toEqual(["num", "phone", "addr", "src", "resp", "note"]);
  });
  it("a phone is always above the address, on every list", () => {
    const invoice: Facts = { addr: "501 Pine Rd", links: "CTR-0033", phone: "(818) 555-0158", due: "Oct 24" };
    const k = keys(layoutFacts(invoice, "rich", "phone"));
    expect(k.indexOf("phone")).toBeLessThan(k.indexOf("addr"));
  });
  it("empty facts are skipped", () => {
    expect(keys(layoutFacts({ phone: "", addr: "  ", email: undefined, work: "Roof" }, "rich", "phone"))).toEqual(["work"]);
  });
  it("FACT_ORDER has no duplicates and every fact has an icon", () => {
    expect(new Set(FACT_ORDER).size).toBe(FACT_ORDER.length);
    for (const k of FACT_ORDER) expect(FACT_ICON[k], k).toBeTruthy();
  });
  it.each([
    ["leads", ["num", "phone", "email", "addr", "src", "svc", "resp", "note"]],
    ["estimates", ["num", "phone", "addr", "work", "valid", "resp"]],
    ["invoices", ["num", "phone", "addr", "due", "links", "last"]],
    ["clients", ["num", "phone", "email", "addr", "src", "last"]],
    ["visits", ["phone", "addr", "work", "resp", "note"]],
    ["catalog", ["num", "supplier", "stock", "desc"]],
    ["tasks", ["links", "resp", "due", "note"]],
  ] as [string, FactKey[]][])("%s: no two facts on one card share an icon", (_, ks) => {
    const icons = ks.map((k) => FACT_ICON[k]);
    expect(new Set(icons).size, icons.join(",")).toBe(icons.length);
  });
});

describe("short fixed-length facts go in pairs", () => {
  it("document number and phone share one line", () => {
    expect(layoutFacts({ num: "EST-0145", phone: "(818) 555-0158", addr: "501 Pine Rd" }, "rich", "phone")[0]).toEqual({ pair: ["num", "phone"] });
  });
  it(`over ${HALF_MAX.phone} characters on a phone → own line`, () => {
    const lines = layoutFacts({ num: "LEA-0229", phone: "(213) 555-0100 · Google number" }, "rich", "phone");
    expect(lines).toEqual([{ key: "num" }, { key: "phone" }]);
  });
  it(`up to ${HALF_MAX.wide} characters still pairs on tablet and desktop`, () => {
    const lines = layoutFacts({ num: "LEA-0229", phone: "(213) 555-0100 · Google #" }, "rich", "tablet");
    expect(lines).toEqual([{ pair: ["num", "phone"] }]);
  });
  it("long facts never pair, even if short", () => {
    expect(layoutFacts({ addr: "1 A St", work: "Roof" }, "rich", "phone")).toEqual([{ key: "addr" }, { key: "work" }]);
  });
});

describe("densities", () => {
  const many: Facts = { num: "INV-1", phone: "(818) 555-0158", email: "a@b.co", addr: "501 Pine Rd", work: "Roof", when: "Nov 9", resp: "Carlos", links: "CTR-1", desc: "Long", note: "Dog" };
  it("compact shows no facts", () => expect(layoutFacts(many, "compact", "phone")).toEqual([]));
  it(`regular: at most ${REGULAR_MAX_LINES} lines, no description or note`, () => {
    const l = layoutFacts(many, "regular", "phone");
    expect(l.length).toBeLessThanOrEqual(REGULAR_MAX_LINES);
    expect(keys(l)).not.toContain("desc");
    expect(keys(l)).not.toContain("note");
  });
  it("rich shows everything", () => expect(keys(layoutFacts(many, "rich", "phone")).length).toBe(Object.keys(many).length));
  it("row: no pairs, columns in the one order", () => {
    expect(layoutFacts({ phone: "1", num: "2" }, "row", "desktop")).toEqual([{ key: "num" }, { key: "phone" }]);
    expect(rowColumns(["resp", "addr", "phone"])).toEqual(["phone", "addr", "resp"]);
  });
});

describe("contact buttons", () => {
  it("always call, SMS, map, email — only for what the card has", () => {
    const a = contactActions({ email: "a@b.co", addr: "12 Vine St, Altadena, CA 91001", phone: "(626) 555-0142" }, "ios");
    expect(a.map((x) => x.kind)).toEqual(["call", "sms", "map", "email"]);
    expect(a[0]!.url).toBe("tel:+16265550142");
    expect(a[1]!.url).toBe("sms:+16265550142");
    expect(contactActions({ addr: "1 A St" }, "ios").map((x) => x.kind)).toEqual(["map"]);
    expect(contactActions({ phone: "n/a", email: "nope" }, "ios")).toEqual([]);
  });
  it("map opens Apple Maps on iOS, Google Maps elsewhere", () => {
    expect(mapsUrl("12 Vine St", "ios")).toBe("https://maps.apple.com/?q=12%20Vine%20St");
    expect(mapsUrl("12 Vine St", "android")).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=12%20Vine%20St$/);
  });
});

describe("touch targets: App Store 44 pt, Android 48 dp", () => {
  const hit = { ios: 44, android: 48 };
  it("a 36 button gets 4 on iOS, 6 on Android each side", () => {
    expect(touchPad(36, "ios", hit)).toBe(4);
    expect(touchPad(36, "android", hit)).toBe(6);
  });
  it("a 24 chip reaches 44 / 48", () => {
    expect(24 + 2 * touchPad(24, "ios", hit)).toBe(44);
    expect(24 + 2 * touchPad(24, "android", hit)).toBe(48);
  });
  it("never negative", () => expect(touchPad(60, "ios", hit)).toBe(0));
});

describe("status edge only for warn / bad", () => {
  it.each([
    [["ok", undefined], undefined],
    [["info", "warn"], "warn"],
    [["warn", "bad"], "bad"],
    [["neutral"], undefined],
  ] as [string[], string | undefined][])("%j → %s", (tones, edge) => expect(edgeTone(tones)).toBe(edge));
});
