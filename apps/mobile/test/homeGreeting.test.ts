/**
 * #2922 блокер 2 (проверка 7204253956, Д-шапка-4 «имя один раз»): «Главная» — крупно словом вкладки, приветствие — в строке 13
 * над ней (#2844 б). Без имени у пользователя приветствия нет: в строке только дата, а не «Пт, 27 ноября · Главная» над «Главная».
 */
import { describe, expect, it } from "vitest";
import { greetingFor } from "../src/features/greeting";
import { overviewHead } from "../src/ui/templates/overviewHead";

const t = (k: string, p?: { name: string }) => (k === "nav.home" ? "Главная" : `${k}:${p?.name}`);

describe("the home greeting", () => {
  it("with a name: the part of the day and the first name", () => {
    expect(greetingFor("Alex Rivera", 9 * 60, t)).toBe("proto.home.hello.morning:Alex");
    expect(greetingFor("Alex", 13 * 60, t)).toBe("proto.home.hello.day:Alex");
    expect(greetingFor("Alex", 19 * 60, t)).toBe("proto.home.hello.evening:Alex");
  });
  it("without a name: no greeting at all — never the tab's word a second time", () => {
    expect(greetingFor("", 9 * 60, t)).toBeUndefined();
    expect(greetingFor("   ", 9 * 60, t)).toBeUndefined();
  });
});

describe("the Overview's head: the live screen and the showcase take it from one function", () => {
  it("the big title is the tab's word; the 13 line — the date and the greeting", () => {
    expect(overviewHead("Главная", { date: "Пт, 27 ноября", text: "Доброе утро, Алекс" })).toEqual({ title: "Главная", kicker: "Пт, 27 ноября · Доброе утро, Алекс" });
  });
  it("no name: the 13 line is only the date — «Главная» once", () => {
    const h = overviewHead("Главная", { date: "Пт, 27 ноября", text: greetingFor("", 9 * 60, t) });
    expect(h).toEqual({ title: "Главная", kicker: "Пт, 27 ноября" });
    expect(`${h.kicker} ${h.title}`.match(/Главная/g)?.length).toBe(1);
  });
  it("no greeting: no 13 line", () => {
    expect(overviewHead("Деньги", undefined)).toEqual({ title: "Деньги", kicker: undefined });
  });
  it("OverviewScreen: both the preview and the live screen use overviewHead (the showcase shows the screen as it is)", () => {
    const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/ui/templates/OverviewScreen.tsx"), "utf8") as string;
    expect(src.match(/overviewHead\(p\.title, g\)/g)?.length).toBe(1);
    expect(src).not.toMatch(/g\?\.text \?\? p\.title/);
    expect(src.match(/\bhead\.title\b/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src.match(/\bhead\.kicker\b/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
