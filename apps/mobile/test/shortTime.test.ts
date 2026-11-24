/**
 * Short words of the Home (features/shortTime.ts) — bugs found by the lead in the simulator 20.11 ~23:30 LA:
 * 1. «20 ч 26 мин в дороге» in the trio cell; 2. «1217 мин ждёт» on the tile «Лиды без ответа»; 3. «Valley · мастер» (a sub's
 * company word under the label «мастер»). The clock is fixed (rule 19): `NOW` is 20.11.2026 23:30 in Los Angeles.
 */
import { describe, expect, it } from "vitest";
import { roadShort, visitWho, waitParams, waitShort } from "../src/features/shortTime";
import { translate, type Lang } from "../src/i18n/translate";
import type { DictKey } from "../src/i18n";

const TZ = "America/Los_Angeles";
const NOW = Date.parse("2026-11-21T07:30:00Z"); // 20.11 23:30 LA
const tr = (lang: Lang) => (k: DictKey, p?: Record<string, string | number>) => translate(lang, k, p);
const ru = tr("ru");
const fmt = { time: (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso)), day: (iso: string) => iso.slice(5, 10) };
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

describe("waitShort — one unit, never «1217 мин»", () => {
  it("minutes, then whole hours, then days", () => {
    expect(waitShort(45, ru)).toBe("45 мин");
    expect(waitShort(120, ru)).toBe("2 ч");
    expect(waitShort(1217, ru)).toBe("20 ч");
    expect(waitShort(1226, ru)).toBe("20 ч");
    expect(waitShort(1440, ru)).toBe("1 дн");
    expect(waitShort(3000, tr("en"))).toBe("2 d");
    expect(waitShort(90, tr("es"))).toBe("1 h");
  });
  it("the tile «Лиды без ответа»: «20 ч ждёт», not «1217 мин ждёт»", () => {
    expect(translate("ru", "px1.tile.leadsWait", { m: waitShort(1217, ru) })).toBe("20 ч ждёт");
    expect(translate("en", "px1.tile.leadsWait", { m: waitShort(1217, tr("en")) })).toBe("waiting 20 h");
    expect(translate("es", "px1.tile.leadsWait", { m: waitShort(1217, tr("es")) })).toBe("espera 20 h");
  });
  it("the lead rows and «Требует действия»: the attention params {m} in words", () => {
    const p = waitParams({ m: 1217, name: "Kevin", d: 0 }, ru);
    expect(translate("ru", "inbox.waiting", p)).toBe("Ждёт ответа 20 ч");
    expect(translate("ru", "att.lead", p)).toBe("Лид без ответа 20 ч · Kevin");
    expect(translate("en", "inbox.waiting", waitParams({ m: 12 }, tr("en")))).toBe("Waiting 12 min");
    // params without a wait are left as they are
    expect(waitParams({ n: 3 }, ru)).toEqual({ n: 3 });
    expect(waitParams(undefined, ru)).toBeUndefined();
  });
});

describe("roadShort — «в дороге» without a huge number", () => {
  it("up to 3 h — the short wait", () => {
    expect(roadShort(ago(25), NOW, ru, fmt, TZ)).toBe("25 мин");
    expect(roadShort(ago(150), NOW, ru, fmt, TZ)).toBe("2 ч");
  });
  it("past 3 h the same day — since when", () => {
    // 20.11 8:34 LA = 16:34Z
    expect(roadShort("2026-11-20T16:34:00Z", NOW, ru, fmt, TZ)).toBe("с 8:34 AM");
  });
  it("from the day before — «с вчера»; older — the date", () => {
    expect(roadShort("2026-11-20T03:04:00Z", NOW, ru, fmt, TZ)).toBe("с вчера"); // 19.11 19:04 LA, 20 h 26 min ago
    expect(roadShort("2026-11-20T03:04:00Z", NOW, tr("en"), fmt, TZ)).toBe("since yesterday");
    expect(roadShort("2026-11-17T18:00:00Z", NOW, ru, fmt, TZ)).toBe("с 11-17");
  });
  it("never «20 ч 26 мин»", () => {
    expect(roadShort(ago(20 * 60 + 26), NOW, ru, fmt, TZ)).not.toMatch(/ч \d+ мин/);
  });
});

describe("visitWho — the assignee, not a word of something else", () => {
  const members = [
    { id: "m-alex", name: "Alex Rivera", kind: "employee" as const },
    { id: "m-jo", name: "Jo Kim", kind: "employee" as const },
    { id: "m-sub", name: "Valley Electric LLC", kind: "sub" as const },
  ];
  it("an employee — the first name under «мастер»", () => {
    expect(visitWho({ techId: "m-alex" }, members, ru)).toEqual({ value: "Alex", label: "мастер", none: false });
    expect(visitWho({ assigneeIds: ["m-alex", "m-jo"] }, members, ru).value).toBe("Alex +1");
  });
  it("a sub — under «субподрядчик», not «мастер»", () => {
    expect(visitWho({ techId: "m-sub" }, members, ru)).toEqual({ value: "Valley", label: "субподрядчик", none: false });
  });
  it("nobody (or a removed person) — «Не назначен»", () => {
    expect(visitWho({}, members, ru)).toEqual({ value: "Не назначен", label: "мастер", none: true });
    expect(visitWho({ techId: "gone" }, members, ru).value).toBe("Не назначен");
    expect(visitWho({}, members, tr("en")).value).toBe(translate("en", "st.unassigned"));
  });
});
