import { describe, expect, it } from "vitest";
import { noticeRead } from "../src/cloud/noticeRead";

const SPLIT = "2026-11-19T13:00:00Z";

describe("a notification read for this person (Р-8b)", () => {
  it("my own mark: read", () => {
    expect(noticeRead(null, true, SPLIT)).toBe(true);
    expect(noticeRead("2026-11-20T10:00:00Z", true, SPLIT)).toBe(true);
  });
  it("read by the company before the split: read for everyone (nothing lights up after the update)", () => {
    expect(noticeRead("2026-11-18T09:00:00Z", false, SPLIT)).toBe(true);
  });
  it("the shared mark after the split (someone else, an old build): not mine — unread", () => {
    expect(noticeRead("2026-11-19T13:00:01Z", false, SPLIT)).toBe(false);
    expect(noticeRead(SPLIT, false, SPLIT)).toBe(false);
  });
  it("nobody read it: unread", () => {
    expect(noticeRead(null, false, SPLIT)).toBe(false);
    expect(noticeRead(undefined, false, SPLIT)).toBe(false);
  });
  it("a server before the migration (no split): the shared column, as before", () => {
    expect(noticeRead("2026-11-20T10:00:00Z", false, null)).toBe(true);
    expect(noticeRead(null, false, null)).toBe(false);
  });
  it("a broken time is not «read»", () => {
    expect(noticeRead("not a date", false, SPLIT)).toBe(false);
  });
});
