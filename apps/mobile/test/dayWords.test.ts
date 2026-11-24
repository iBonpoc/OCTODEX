/** unit:dayWords — #2363 F46: one rule for a day in a line (today / tomorrow / yesterday by word, else «пт, 19 нояб.») */
import { describe, expect, it } from "vitest";
import { dayWord, type DayWords } from "../src/features/dayWords";

const ru: DayWords = { today: "Сегодня", tomorrow: "Завтра", yesterday: "Вчера", day: () => "пт, 19 нояб." };
const en: DayWords = { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday", day: () => "Fri, Nov 19" };

describe("unit:dayWords", () => {
  it("today, tomorrow, yesterday are words; in the middle of a line — small", () => {
    expect(dayWord(0, "x", ru)).toBe("Сегодня");
    expect(dayWord(1, "x", ru)).toBe("Завтра");
    expect(dayWord(-1, "x", ru)).toBe("Вчера");
    expect(dayWord(-1, "x", ru, true)).toBe("вчера");
    expect(dayWord(0, "x", en, true)).toBe("today");
  });
  it("any other day — the weekday and the date, never «2 дн. назад» or «позавчера»", () => {
    for (const off of [-2, -3, -9, 2, 30]) expect(dayWord(off, "x", ru, true)).toBe("пт, 19 нояб.");
    expect(dayWord(-2, "x", en)).toBe("Fri, Nov 19");
  });
});
