import { describe, expect, it } from "vitest";
import { statusBarStyleFor } from "../src/ui/statusBarStyle";

/** the clock follows the app's theme, whatever the phone's own appearance is (#2321, the audit's iPhone) */
describe("statusBarStyleFor", () => {
  it("a dark page: light clock and icons", () => expect(statusBarStyleFor("dark")).toBe("light"));
  it("a light page: dark clock and icons", () => expect(statusBarStyleFor("light")).toBe("dark"));
});
