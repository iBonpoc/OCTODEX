/** Wave П1a bridge: an inspection without a job is shown through an in-memory job that never reaches the server. */
import { describe, expect, it } from "vitest";
import { realJob } from "../src/cloud/inspectionBridge";

describe("inspection without a job (П1a bridge)", () => {
  it("the in-memory job id is derived from the visit and never sent", () => {
    expect(realJob("insp-f3200000-0000-4000-8000-000000000001")).toBeNull();
  });
  it("a real job id goes through; empty stays empty", () => {
    expect(realJob("e3200000-0000-4000-8000-000000000001")).toBe("e3200000-0000-4000-8000-000000000001");
    expect(realJob(undefined)).toBeNull();
    expect(realJob(null)).toBeNull();
    expect(realJob("")).toBeNull();
  });
});
