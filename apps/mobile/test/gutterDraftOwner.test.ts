import { describe, expect, it } from "vitest";
import { DEVICE_KEYS, isDeviceKey } from "../src/features/deleteAccount";
import { DRAFT_KEY } from "../src/modules/gutters/canvas/draftStore";
import { wipedOnDelete } from "../src/data/outboxOwner";

/** #1044: the old canvas draft is device-wide with no owner — it goes with the person's other keys (deleted account, another person signing in). */
describe("the old Gutters canvas draft is a device key", () => {
  it("its key is among the device keys (the wipe of a deleted account and of a changed person takes it)", () => {
    expect(DEVICE_KEYS).toContain(DRAFT_KEY);
    expect(isDeviceKey(DRAFT_KEY)).toBe(true);
  });
  it("and it is wiped when the account is deleted (outboxOwner's rule), not kept like the shared outbox", () => {
    expect(wipedOnDelete(DRAFT_KEY)).toBe(true);
  });
  it("a settings key of the module that is not a person's data stays (the toolbar place)", () => {
    expect(isDeviceKey("octo.mod.gutters.toolbar.v1")).toBe(false);
  });
});
