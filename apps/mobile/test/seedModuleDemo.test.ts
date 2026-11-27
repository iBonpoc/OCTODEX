/** #3024: the test client's module part (ModuleDef.demo) is in the demo, and not in the e2e runs (the runner's mark) */
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { registerModule } from "../src/modules/registry";
import { guttersDemo } from "../src/modules/gutters/demo";
import { makeSeed, NO_MODULE_DEMO_KEY } from "../src/data/seed";
import { gutterData } from "../src/modules/gutters/data";

// the module as the app has it, only its demo (module.ts pulls in screens vitest does not load)
registerModule({ key: "gutters", titleKey: "mod.gutters.title", hintKey: "mod.gutters.hint", trialDays: 7, priceCentsMonthly: 0, demo: guttersDemo } as never);
const store = new Map<string, string>();
const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
afterEach(() => {
  store.clear();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});
const e7 = (d: ReturnType<typeof makeSeed>) => d.estimates.find((e) => e.id === "e7")!;

describe("the modules' demo data of the test client (#3024)", () => {
  it("the demo: the measurement gm-tc-1 and its lines in EST-0007, the total counted with them", () => {
    const d = makeSeed();
    expect(gutterData(d).measurements.map((m) => m.id)).toEqual(["gm-tc-1"]);
    const lines = e7(d).doc!.options[0]!.lines;
    expect(lines.filter((l) => (l.source as { measurementId?: string } | undefined)?.measurementId === "gm-tc-1")).toHaveLength(10);
    expect(e7(d).totalCents).toBe(187410);
  });
  it("the e2e runner's mark: no gm-tc-1 anywhere, EST-0007 with the core's lines only", () => {
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    ls.setItem(NO_MODULE_DEMO_KEY, "1");
    const d = makeSeed();
    expect(JSON.stringify(d)).not.toContain("gm-tc-1");
    expect(gutterData(d)).toEqual({ measurements: [], elements: [] });
    expect(e7(d).doc!.options[0]!.lines.map((l) => l.id)).toEqual(["l-e7-1", "l-e7-2", "l-e7-3"]);
  });
  it("another value or a broken localStorage: the demo data stays", () => {
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: () => { throw new Error("blocked"); } };
    expect(gutterData(makeSeed()).measurements).toHaveLength(1);
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    ls.setItem(NO_MODULE_DEMO_KEY, "0");
    expect(gutterData(makeSeed()).measurements).toHaveLength(1);
  });
});
