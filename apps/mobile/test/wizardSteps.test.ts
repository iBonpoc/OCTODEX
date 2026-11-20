import { describe, expect, it } from "vitest";
import { SETUP_STEPS, wizardSteps } from "@/features/companySetup";
import type { Company, ServiceCategory } from "@/data/types";

const company = {} as Company;
const cat = (id: string, archivedAt?: string) => ({ id, name: id, position: 0, archivedAt }) as unknown as ServiceCategory;

// #2007: «Чем вы занимаетесь?» at the first run and the wizard's «Направления» asked the same twice
describe("wizardSteps (#2007)", () => {
  it("С1 a direction chosen at the first run: no «Направления» step, 7 steps", () => {
    const s = wizardSteps(company, [cat("roofing")]);
    expect(s).not.toContain("trades");
    expect(s).toHaveLength(SETUP_STEPS.length - 1);
    expect(s[s.indexOf("brand") + 1]).toBe("documents");
  });
  it("С2 no direction yet: the step is there, all 8", () => {
    expect(wizardSteps(company, [])).toEqual(SETUP_STEPS);
    expect(wizardSteps(company, [cat("old", "2026-11-01T00:00:00Z")])).toEqual(SETUP_STEPS);
  });
  it("the step stays while the person stands on it (a direction added there does not pull it away)", () => {
    expect(wizardSteps(company, [cat("roofing")], "trades")).toEqual(SETUP_STEPS);
  });
});
