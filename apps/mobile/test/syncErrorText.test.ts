/** Debt 2 of «Сметы» №1: «Профиль и аккаунт» shows the sync error in our words only, never the server's text. */
import { describe, expect, it } from "vitest";
import { syncErrorKey } from "../src/data/syncErrorText";
import { translate } from "../src/i18n/translate";

const SERVER = [
  'new row violates row-level security policy for table "estimates"',
  "duplicate key value violates unique constraint \"estimate_versions_pkey\"",
  "JWT expired",
  "estimate lines do not match its document",
];

describe("sync error in our words", () => {
  it("no answer of the server → «no connection»", () => {
    for (const m of ["Failed to fetch", "Network request failed", "TypeError: Load failed", "The operation timed out"]) expect(syncErrorKey(m)).toBe("account.syncErr.network");
  });
  it("any other failure → one general text; the server's text never reaches the screen", () => {
    for (const m of SERVER) {
      const k = syncErrorKey(m);
      expect(k).toBe("account.syncErr.general");
      for (const lang of ["ru", "en", "es"] as const) expect(translate(lang, k)).not.toContain(m);
    }
  });
});
