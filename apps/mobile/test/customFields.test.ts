/** Own fields (wave П-2b): the phone checks a value as the server does (supabase T42, app.tg_custom_value_guard). */
import { describe, expect, it } from "vitest";
import { customValueOk } from "../src/data/customFields";

const F = (type: Parameters<typeof customValueOk>[0]["type"], options: string[] = []) => ({ type, options });

describe("customValueOk — the same cases as T42", () => {
  it("text and long text", () => {
    expect(customValueOk(F("text"), "Oak Park HOA")).toBe(true);
    expect(customValueOk(F("text"), 12)).toBe(false);
    expect(customValueOk(F("text"), "x".repeat(501))).toBe(false);
    expect(customValueOk(F("long_text"), "x".repeat(10000))).toBe(true);
  });
  it("number and checkbox", () => {
    expect(customValueOk(F("number"), 3)).toBe(true);
    expect(customValueOk(F("number"), "three")).toBe(false);
    expect(customValueOk(F("checkbox"), true)).toBe(true);
    expect(customValueOk(F("checkbox"), "yes")).toBe(false);
  });
  it("date: a real day only", () => {
    expect(customValueOk(F("date"), "2026-12-01")).toBe(true);
    expect(customValueOk(F("date"), "2026-02-30")).toBe(false);
    expect(customValueOk(F("date"), "12/01/2026")).toBe(false);
  });
  it("lists: only the choices", () => {
    expect(customValueOk(F("select", ["Mon", "Wed", "Fri"]), "Wed")).toBe(true);
    expect(customValueOk(F("select", ["Mon", "Wed", "Fri"]), "Sun")).toBe(false);
    expect(customValueOk(F("multiselect", ["Copper", "Aluminum"]), ["Copper"])).toBe(true);
    expect(customValueOk(F("multiselect", ["Copper", "Aluminum"]), ["Copper", "Gold"])).toBe(false);
    expect(customValueOk(F("multiselect", ["Copper"]), "Copper")).toBe(false);
  });
  it("file: a file id", () => {
    expect(customValueOk(F("file"), "0195f3c2-0000-7000-8000-000000000001")).toBe(true);
    expect(customValueOk(F("file"), "photo.jpg")).toBe(false);
  });
});
