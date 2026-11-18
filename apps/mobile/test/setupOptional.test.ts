import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import { companyState, isOptionalStep, setupProgress, stepSettled } from "../src/features/companySetup";
import type { Company } from "../src/data/types";

// #2065 (founder 18.11): licenses and insurance are optional in any state
const bare = (): Company => {
  const c = structuredClone(makeSeed().company!) as Company;
  c.licenses = [];
  c.insurance = { ...c.insurance, cglCarrier: undefined, wcCarrier: undefined, wcExempt: false } as Company["insurance"];
  c.skipped = [];
  return c;
};

describe("licenses and insurance are optional (#2065)", () => {
  const cats = makeSeed().serviceCategories;
  it("С1 no license and no insurance: not unfinished, never the next step", () => {
    const c = bare();
    expect(isOptionalStep("licenses") && isOptionalStep("insurance")).toBe(true);
    expect(stepSettled(c, "licenses", cats) && stepSettled(c, "insurance", cats)).toBe(true);
    const p = setupProgress(c, cats);
    expect(p.next).not.toBe("licenses");
    expect(p.next).not.toBe("insurance");
  });
  it("С1 with everything else filled in, the progress is full without them", () => {
    const seed = makeSeed();
    const c = { ...bare(), brand: seed.company!.brand.logo ? seed.company!.brand : { ...seed.company!.brand, logo: "data:x" } };
    const p = setupProgress(c, cats);
    // the steps that are not optional decide; licenses/insurance never hold it back
    const withThem = setupProgress({ ...c, licenses: seed.company!.licenses, insurance: seed.company!.insurance }, cats);
    expect(p.done).toBe(withThem.done);
  });
  it("the required steps are still required", () => {
    const c = { ...bare(), name: "" };
    expect(stepSettled(c, "profile", cats)).toBe(false);
  });
  it("С3 the default state is the company's, or empty — never a guessed CA", () => {
    expect(companyState({ address: { line1: "", city: "", state: " tx ", zip: "" } } as Company)).toBe("TX");
    expect(companyState({ address: { line1: "", city: "", state: "", zip: "" } } as Company)).toBe("");
    expect(companyState(null)).toBe("");
  });
});
