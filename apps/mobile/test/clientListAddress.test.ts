import { describe, expect, it } from "vitest";
import { clientListAddress } from "../src/features/clientListAddress";

const more = (n: number) => `ещё ${n}`;
const p = (address: string, city: string) => ({ address, city });

describe("clientListAddress (#3033): billing first, else the one property, never «—»", () => {
  it("the billing address wins over the properties", () => {
    expect(clientListAddress({ line1: "PO Box 12", city: "Pasadena", state: "CA", zip: "91103" }, [p("1420 Oak Grove Ave", "Pasadena")], more)).toBe("PO Box 12, Pasadena");
  });
  it("no billing, one property — its address", () => {
    expect(clientListAddress(undefined, [p("1420 Oak Grove Ave", "Pasadena, CA 91103")], more)).toBe("1420 Oak Grove Ave, Pasadena");
  });
  it("no billing, several properties — the first and «ещё N»", () => {
    expect(clientListAddress(undefined, [p("1 A St", "Burbank"), p("2 B St", "Glendale"), p("3 C St", "Encino")], more)).toBe("1 A St, Burbank · ещё 2");
  });
  it("nothing — no line", () => {
    expect(clientListAddress(undefined, [], more)).toBeUndefined();
    expect(clientListAddress({ line1: "", city: "" }, [], more)).toBeUndefined();
  });
});
