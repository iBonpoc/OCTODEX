import { describe, expect, it } from "vitest";
import { isDeviceKey } from "../src/features/deleteAccount";
import { DRAFT_KEY } from "../src/modules/gutters/canvas/draftStore";
import { wipedOnDelete } from "../src/data/outboxOwner";

/** #1044: the old canvas draft is device-wide with no owner — it is wiped with the person's other keys when the account is deleted (a sign-out wipes nothing: forgetOldDraft clears the rest when the canvas opens). */
describe("the old Gutters canvas draft is a device key", () => {
  it("its key is a device key (the wipe of a deleted account takes it): by the module prefix, the core names no niche", () => {
    expect(DRAFT_KEY.startsWith("octo.mod.")).toBe(true);
    expect(isDeviceKey(DRAFT_KEY)).toBe(true);
  });
  it("and it is wiped when the account is deleted (outboxOwner's rule), not kept like the shared outbox", () => {
    expect(wipedOnDelete(DRAFT_KEY)).toBe(true);
  });
  it("a key of another kind stays (the theme)", () => {
    expect(isDeviceKey("octo.theme.v1")).toBe(false);
  });
});
