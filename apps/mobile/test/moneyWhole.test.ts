import { describe, expect, it } from "vitest";
import { moneyText, moneyWholeText } from "../src/i18n/translate";

describe("moneyWholeText (#3029/#3030): overviews show whole dollars, documents keep cents", () => {
  it("whole dollars, en-US, rounded half up on the cents", () => {
    expect(moneyWholeText(184000)).toBe("$1,840");
    expect(moneyWholeText(137510)).toBe("$1,375");
    expect(moneyWholeText(137550)).toBe("$1,376");
    expect(moneyWholeText(77236)).toBe("$772");
    expect(moneyWholeText(1234567890)).toBe("$12,345,679");
  });
  it("under a dollar the cents stay; zero is $0.00", () => {
    expect(moneyWholeText(45)).toBe("$0.45");
    expect(moneyWholeText(0)).toBe("$0.00");
    expect(moneyWholeText(99)).toBe("$0.99");
    expect(moneyWholeText(100)).toBe("$1");
  });
  it("a negative amount takes the minus sign U+2212", () => {
    expect(moneyWholeText(-7850)).toBe("−$79");
    expect(moneyWholeText(-45)).toBe("−$0.45");
  });
  it("the documents' format is unchanged", () => {
    expect(moneyText(184000)).toBe("$1,840.00");
    expect(moneyText(-7850)).toBe("−$78.50");
  });
});
