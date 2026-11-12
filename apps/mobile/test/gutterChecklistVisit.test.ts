/**
 * #607: the Gutters starter checklists, once the office has added them, come into every «работа» visit by themselves — and into
 * no inspection («осмотр»). The template is the company's own afterwards: the office may untick «работа» there.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { checklistFor, starterTemplate } from "../src/features/checklist";

const t = (k: string) => `«${k}»`;
const templates = () => (gutters.checklistTemplates ?? []).map((s, i) => starterTemplate("gutters", s, t as never, `tpl${i}`)!);

let gutters: typeof import("../src/modules/gutters/module").default;

describe("starter checklists of Gutters in visits (#607)", () => {
  it("loads", async () => {
    gutters = (await import("../src/modules/gutters/module")).default;
    expect(gutters.checklistTemplates).toHaveLength(3);
  });
  it("the three starters apply to «работа» visits and to no other kind, not to every visit", () => {
    const ts = templates();
    expect(ts).toHaveLength(3);
    for (const x of ts) expect(x.appliesTo).toEqual({ everyVisit: false, visitKinds: ["work"], catalogItemIds: [] });
  });
  it("a work visit gets the items of all three (each once), an inspection gets none", () => {
    let n = 0;
    const id = () => `i${++n}`;
    const work = checklistFor({ kind: "work" }, templates(), id);
    const all = (gutters.checklistTemplates ?? []).reduce((k, s) => k + s.items.length, 0);
    expect(work).toHaveLength(all);
    expect(checklistFor({ kind: "inspection" }, templates(), id)).toEqual([]);
  });
  it("the office's own choice stays: a template with «работа» unticked comes into no visit; an archived one never", () => {
    const [a, b, c] = templates();
    const off = { ...a!, appliesTo: { ...a!.appliesTo, visitKinds: [] } };
    const arch = { ...b!, archivedAt: "2026-11-01T00:00:00Z" };
    const work = checklistFor({ kind: "work" }, [off, arch, c!], () => "x");
    expect(work).toHaveLength(c!.items.length);
  });
});
