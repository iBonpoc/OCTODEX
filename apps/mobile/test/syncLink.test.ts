/** The sync badge: «no network» vs «server unavailable» (docs/specs/23 §3, review #244 №3). */
import { describe, expect, it } from "vitest";
import { badgeState } from "../src/data/syncLink";
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
  it("the words differ in every language and keep the count", () => {
    for (const d of [ru, en, es] as Record<string, string>[]) {
      expect(d["sync.server.badge"]).toContain("{n}");
      expect(d["sync.server.badge"]).not.toBe(d["offline.badge"]);
    }
  });
});
