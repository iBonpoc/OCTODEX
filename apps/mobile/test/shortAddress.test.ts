import { describe, expect, it } from "vitest";
import { shortAddress } from "../src/features/shortAddress";

describe("shortAddress (#3017): the street and the town, no state, no ZIP, no «—»", () => {
  it("cuts the state and the ZIP", () => {
    expect(shortAddress("4512 Ventura Canyon Ave", "Sherman Oaks, CA 91423")).toBe("4512 Ventura Canyon Ave, Sherman Oaks");
    expect(shortAddress("1420 Oak Grove Ave", "Pasadena, CA 91103-1234")).toBe("1420 Oak Grove Ave, Pasadena");
    expect(shortAddress("88 Rose St", "Arcadia CA")).toBe("88 Rose St, Arcadia");
  });
  it("the town alone, the street alone, nothing", () => {
    expect(shortAddress(undefined, "Encino")).toBe("Encino");
    expect(shortAddress("77 Elm St", "")).toBe("77 Elm St");
    expect(shortAddress("", "")).toBeUndefined();
    expect(shortAddress(null, null)).toBeUndefined();
  });
  it("a street that already names the town does not say it twice", () => {
    expect(shortAddress("2207 Ocean Park Blvd, Santa Monica, CA 90405", "Santa Monica")).toBe("2207 Ocean Park Blvd, Santa Monica");
  });
});
