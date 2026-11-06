/** unit:firstSteps — «Первые шаги» and «Чем вы занимаетесь?» (docs/specs/13 §3.11, 19 §2 п.1–2). */
import { describe, expect, it } from "vitest";
import { makeSeed } from "../src/data/seed";
import type { DB } from "../src/data/types";
import { firstSteps, firstStepsLeft, pickTrades, tradeMatches } from "../src/features/firstSteps";

const seed = makeSeed() as DB;
const WEB = { web: true, standalone: false };
const APP = { web: false, standalone: false };
const bare: DB = {
  ...seed,
  jobs: [],
  members: seed.members.filter((m) => m.id === seed.me),
  company: { ...seed.company!, legalName: "", contacts: [], licenses: [], brand: { ...seed.company!.brand, logo: undefined } },
};

describe("unit:firstSteps — the owner's first steps (13 §3.11 п.2)", () => {
  it("профиль · первая работа · команда · установить (browser only); no import or online payments yet (Apple 2.1)", () => {
    expect(firstSteps(bare, "director", WEB).map((s) => s.id)).toEqual(["profile", "job", "team", "install"]);
    expect(firstSteps(bare, "director", APP).map((s) => s.id)).toEqual(["profile", "job", "team"]);
  });
  it("only the owner, only with a company", () => {
    for (const r of ["dispatcher", "sales", "tech"] as const) expect(firstSteps(bare, r, WEB), r).toEqual([]);
    expect(firstSteps({ ...bare, company: null }, "director", WEB)).toEqual([]);
  });
  it("each step opens its screen; install shows how", () => {
    const by = Object.fromEntries(firstSteps(bare, "director", WEB).map((s) => [s.id, s]));
    expect(by.profile!.href).toBe("/company/profile?wizard=1");
    expect(by.job!.href).toBe("/job/new");
    expect(by.team!.href).toBe("/team");
    expect(by.install!.href).toBeUndefined();
  });
  it("done by the data: a job, a second person, the app on the home screen, the document header", () => {
    expect(firstStepsLeft(firstSteps(bare, "director", WEB))).toBe(4);
    const withJob = { ...bare, jobs: seed.jobs.slice(0, 1) };
    expect(firstSteps(withJob, "director", APP).find((s) => s.id === "job")!.done).toBe(true);
    const withTeam = { ...bare, members: seed.members };
    expect(firstSteps(withTeam, "director", APP).find((s) => s.id === "team")!.done).toBe(seed.members.length > 1);
    expect(firstSteps(bare, "director", { web: true, standalone: true }).find((s) => s.id === "install")!.done).toBe(true);
    const c = seed.company!;
    const full = { ...bare, company: { ...c, name: "Acme", legalName: "Acme LLC", entityType: c.entityType ?? "llc", contacts: [{ ...(c.contacts[0] ?? {}), phone: "6265550100" }], licenses: c.licenses.length ? c.licenses : [{ kind: "cslb", number: "1" }], brand: { ...c.brand, logo: "data:image/png;base64,AA" } } } as DB;
    expect(firstSteps(full, "director", APP).find((s) => s.id === "profile")!.done).toBe(true);
  });
});

describe("unit:firstSteps — «Чем вы занимаетесь?» (13 §3.11 п.1)", () => {
  it("search: anywhere in the name, any case; empty — all", () => {
    expect(tradeMatches("Сантехника", "техн")).toBe(true);
    expect(tradeMatches("Plumbing", "PLUMB")).toBe(true);
    expect(tradeMatches("Roofing", "gutt")).toBe(false);
    expect(tradeMatches("Roofing", "  ")).toBe(true);
  });
  it("the picked presets in order, once each, then «Другое» by its own name", () => {
    expect(pickTrades(["plumbing", "hvac", "plumbing"], "  Pressure washing ")).toEqual([{ seedKey: "plumbing" }, { seedKey: "hvac" }, { name: "Pressure washing" }]);
    expect(pickTrades([], "")).toEqual([]);
  });
});
