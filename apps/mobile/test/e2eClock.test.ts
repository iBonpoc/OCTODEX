/**
 * The e2e clock (docs/ai/CHECKS.md §9 п.1, e2e/clock.cjs): a spec does not depend on the real hour. The runner starts
 * every spec at noon of the company's day (Los Angeles) unless the spec asks for another minute or for the real time;
 * every browser context a spec opens itself is put on the same clock with installClock (or the spec says "real").
 */
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { clockFor } = require("../e2e/clock.cjs") as { clockFor: (spec: unknown, env: Record<string, string | undefined>, realNow: number) => number | null };

const e2e = join(__dirname, "../e2e");
const specsDir = join(e2e, "specs");

/** what is wrong with a spec's clock: a context of its own that is not on the runner's clock */
export function clockProblem(src: string): string | null {
  if (/exports\.clock\s*=\s*"real"/.test(src)) return null;
  const contexts = (src.match(/\.newContext\(/g) ?? []).length;
  const installs = (src.match(/\binstallClock\(\s*ctx\b/g) ?? []).length;
  if (installs < contexts) return `${contexts} newContext, ${installs} installClock(ctx): the context runs on the real hour`;
  if (/\.clock\.install\(/.test(src)) return "its own clock.install: the runner's clock is already installed (use exports.clock or installClock(ctx, ms))";
  return null;
}

describe("e2e clock: when a spec starts", () => {
  // 07.11.2026 00:20 in Los Angeles (PST) — the hour that turned builds red (#292, #297)
  const real = Date.parse("2026-11-07T08:20:00Z");
  it("by default at noon of the company's day, whatever the real hour", () => {
    expect(new Date(clockFor({}, {}, real)!).toISOString()).toBe("2026-11-07T20:00:00.000Z");
    expect(new Date(clockFor({}, {}, Date.parse("2026-11-08T07:50:00Z"))!).toISOString()).toBe("2026-11-07T20:00:00.000Z");
  });
  it("a spec may ask for its minute or the real time", () => {
    expect(new Date(clockFor({ clock: { minute: 21 * 60 + 30 } }, {}, real)!).toISOString()).toBe("2026-11-08T05:30:00.000Z");
    expect(clockFor({ clock: "real" }, {}, real)).toBeNull();
    expect(() => clockFor({ clock: { minute: 1440 } }, {}, real)).toThrow();
  });
  it("E2E_NOW starts every spec at the risky moment", () => {
    expect(clockFor({}, { E2E_NOW: "2026-11-07T08:20:00Z" }, real)).toBe(real);
    expect(clockFor({ clock: "real" }, { E2E_NOW: "2026-11-07T08:20:00Z" }, real)).toBe(real);
    expect(() => clockFor({}, { E2E_NOW: "tomorrow" }, real)).toThrow();
  });
});

describe("e2e clock: the runner and the specs", () => {
  it("the runner moves the clock before each spec and puts its context on it", () => {
    const src = readFileSync(join(e2e, "run.cjs"), "utf8");
    expect(src).toMatch(/clockFor\(spec, process\.env, Real\.now\(\)\)/);
    const loop = src.slice(src.indexOf("for (const file of specs)"));
    expect(loop.indexOf("startClock(spec)")).toBeGreaterThan(-1);
    expect(loop.indexOf("startClock(spec)")).toBeLessThan(loop.indexOf(".newContext("));
    expect(loop.indexOf("await installClock(ctx)")).toBeGreaterThan(loop.indexOf(".newContext("));
    expect(loop).toMatch(/spec\.run\(h, \{[^}]*installClock/);
  });
  it("the guard catches a context left on the real hour (example)", () => {
    const bad = 'exports.run = async (h, { browser }) => { const ctx = await browser.newContext({ reducedMotion: "reduce" }); };';
    expect(clockProblem(bad)).toBe("1 newContext, 0 installClock(ctx): the context runs on the real hour");
    expect(clockProblem("await p.clock.install({ time: 1 });")).toMatch(/own clock\.install/);
    expect(clockProblem(bad.replace("};", "await installClock(ctx); };"))).toBeNull();
    expect(clockProblem(`exports.clock = "real";\n${bad}`)).toBeNull();
  });
  const specs = readdirSync(specsDir).filter((f) => f.endsWith(".cjs"));
  it.each(specs.map((f) => [f]))("%s runs on the runner's clock", (f) => {
    expect(clockProblem(readFileSync(join(specsDir, f), "utf8"))).toBeNull();
  });
});
