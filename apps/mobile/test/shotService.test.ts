/** #2360: the photographer's argument parser and the index.json format (scripts/shot). */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it, beforeEach } from "vitest";

const req = createRequire(__filename);
const args = req("../../../scripts/shot/args.cjs");
const idx = req("../../../scripts/shot/index.cjs");

const entry = (o: Record<string, unknown> = {}) => ({
  id: "x", file: "abc1234/today__dark-390-ru-director__abc1234.png", engine: "web", route: "/today", role: "director", theme: "dark", width: 390, lang: "ru",
  commit: "abc1234", branch: "main", takenAt: new Date().toISOString(), by: "t", stamp: "s", keep: false, ref: false, ...o,
});

describe("shot args", () => {
  it("defaults and a full request", () => {
    expect(args.parseArgs(["/today"])).toMatchObject({ route: "/today", theme: "dark", width: 390, lang: "ru", role: "director", font: "normal", frames: 1, engine: "web" });
    const o = args.parseArgs(["/client/c1", "--theme", "light", "--width", "820", "--lang=en", "--role", "tech", "--font", "large", "--reduce-motion", "--scroll", "112", "--crop", "tab-bar", "--keep"]);
    expect(o).toMatchObject({ theme: "light", width: 820, lang: "en", role: "tech", font: "large", reduceMotion: true, scroll: 112, crop: "tab-bar", keep: true });
  });
  it("scroll can be a testID", () => expect(args.parseArgs(["/today", "--scroll", "tile-owed"]).scroll).toBe("tile-owed"));
  it("actions", () => {
    expect(args.parseActions("click:a;fill:search=ab c;wait:300;offline")).toEqual([{ type: "click", arg: "a" }, { type: "fill", arg: "search", value: "ab c" }, { type: "wait", arg: "300" }, { type: "offline", arg: "" }]);
    expect(() => args.parseActions("jump:a")).toThrow(/неизвестно/);
    expect(() => args.parseActions("fill:a")).toThrow(/=/);
  });
  it("rejects bad input with a usage message", () => {
    for (const bad of [["/today", "--theme", "blue"], ["/today", "--width", "500"], ["today"], [], ["/a", "/b"], ["/today", "--nope"], ["/today", "--frames", "99"], ["/today", "--theme"]])
      expect(() => args.parseArgs(bad)).toThrow();
  });
  it("--all expands to 6 screens × 2 themes × 5 header positions", () => {
    const all = args.expandAll(args.parseArgs(["--all"]));
    expect(all).toHaveLength(60);
    expect(new Set(all.map((j: { state: string; theme: string }) => j.state + j.theme)).size).toBe(60);
  });
});

describe("index.json", () => {
  beforeEach(() => { process.env.GORIX_SHOTS_DIR = mkdtempSync(join(tmpdir(), "shots-")); });
  it("validates the required fields", () => {
    expect(idx.validateEntry(entry())).toEqual([]);
    expect(idx.validateEntry(entry({ commit: undefined }))).not.toEqual([]);
    expect(idx.validateEntry(entry({ file: "../x.png" }))).not.toEqual([]);
    expect(idx.validateEntry(entry({ takenAt: "yesterday" }))).not.toEqual([]);
  });
  it("adds, replaces by file, finds newest first", () => {
    idx.addEntry(entry({ takenAt: "2026-11-20T10:00:00Z" }));
    idx.addEntry(entry({ takenAt: "2026-11-21T10:00:00Z" }));
    idx.addEntry(entry({ file: "abc1234/clients.png", route: "/clients", theme: "light", takenAt: "2026-11-19T10:00:00Z" }));
    expect(idx.readIndex().version).toBe(1);
    expect(idx.readIndex().shots).toHaveLength(2);
    expect(idx.find(["today", "dark"])).toHaveLength(1);
    expect(idx.find(["390"]).map((e: { route: string }) => e.route)).toEqual(["/today", "/clients"]);
    expect(idx.find(["light"], { commit: "zzz" })).toEqual([]);
  });
  it("addEntry refuses a broken entry", () => expect(() => idx.addEntry({ file: "a.png" })).toThrow(/index\.json/));
  it("stamp and file name carry the same facts", () => {
    const e = entry({ font: "large", scroll: 72, state: "hdr", dirty: true });
    const name = idx.fileName(e);
    expect(name).toContain("dark-390-ru-director-large-s72");
    expect(name).toContain("abc1234+");
    expect(idx.stampLines(e).join(" ")).toMatch(/abc1234\+.*director · dark · 390 · ru · large · hdr/);
  });
  it("gc removes sets older than 14 days except keep/ref", () => {
    const root = idx.root();
    mkdirSync(join(root, "abc1234"), { recursive: true });
    const old = "2026-10-01T10:00:00Z";
    for (const [n, x] of [["old", {}], ["kept", { keep: true }], ["ref", { ref: true }], ["new", { takenAt: "2026-11-20T10:00:00Z" }]] as const) {
      writeFileSync(join(root, `abc1234/${n}.png`), "x");
      idx.addEntry(entry({ file: `abc1234/${n}.png`, takenAt: old, ...x }));
    }
    const removed = idx.gc(14, Date.parse("2026-11-21T10:00:00Z"));
    expect(removed).toEqual(["abc1234/old.png"]);
    expect(existsSync(join(root, "abc1234/old.png"))).toBe(false);
    expect(existsSync(join(root, "abc1234/kept.png"))).toBe(true);
  });
});
