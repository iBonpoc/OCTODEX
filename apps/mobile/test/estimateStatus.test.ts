/**
 * Estimate status moves (docs/specs/07-estimates.md §4, docs/15-story-map.md §5, handoff S8b).
 * The app rules and the database (app.status_transitions in the migrations) must agree:
 * every app move exists in the database, and every database move lands on an app move (or stays in place).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ESTIMATE_STATUSES, type EstimateStatus } from "../src/data/types";
import { estimateStatus as fromDb } from "../src/cloud/statusMap";
import { ESTIMATE_MOVES, canChangeEstimateCategory, canMoveEstimate, estimateStatusView, isEstimateEditable } from "../src/features/estimateStatus";

const ROOT = path.resolve(__dirname, "../../..");
const migrations = fs
  .readdirSync(path.join(ROOT, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8"))
  .join("\n");
const dbMoves = [...migrations.matchAll(/\('estimate',\s*'([a-z_]+)',\s*'([a-z_]+)'\)/g)].map((m) => [m[1]!, m[2]!] as const);

describe("estimate status: the app knows awaiting_countersign", () => {
  it("is an app status and the database one is no longer folded into sent", () => {
    expect(ESTIMATE_STATUSES).toContain("awaiting_countersign");
    expect(fromDb.awaiting_countersign).toBe("awaiting_countersign");
  });
  it("every status has a label and a status colour (warn while we wait for our signature)", () => {
    for (const s of ESTIMATE_STATUSES) expect(estimateStatusView(s).l).toBeTruthy();
    expect(estimateStatusView("awaiting_countersign")).toEqual({ s: "warn", l: "est.awaitingCountersign" });
    expect(estimateStatusView("approved").s).toBe("ok");
  });
});

describe("estimate status: moves (S6, S8, S8b, edit after send)", () => {
  const ok: [EstimateStatus, EstimateStatus][] = [
    ["draft", "sent"],
    ["sent", "awaiting_countersign"],
    ["awaiting_countersign", "approved"],
    ["sent", "approved"], // on site: client, then employee on the same screen
    ["sent", "draft"], // edit after send → new version
    ["awaiting_countersign", "draft"], // "don't sign — change it"
    ["sent", "declined"],
  ];
  const no: [EstimateStatus, EstimateStatus][] = [
    ["draft", "awaiting_countersign"], // the client must sign a sent version
    ["draft", "approved"],
    ["awaiting_countersign", "sent"], // a new version goes back through draft
    ["approved", "draft"], // signed by both: no edits, only change orders
    ["approved", "awaiting_countersign"],
    ["declined", "approved"],
  ];
  it.each(ok)("%s → %s is allowed", (a, b) => expect(canMoveEstimate(a, b)).toBe(true));
  it.each(no)("%s → %s is not allowed", (a, b) => expect(canMoveEstimate(a, b)).toBe(false));
  it("staying in place is not a move", () => expect(canMoveEstimate("sent", "sent")).toBe(false));

  it("editable: draft, sent and awaiting_countersign (edit = new version); not approved or declined", () => {
    expect(ESTIMATE_STATUSES.filter(isEstimateEditable)).toEqual(["draft", "sent", "awaiting_countersign"]);
  });
});

describe("estimate status: app and database agree", () => {
  it("the database has the estimate moves", () => expect(dbMoves.length).toBeGreaterThan(5));
  it("every app move exists in the database", () => {
    for (const [a, b] of ESTIMATE_MOVES) {
      const found = dbMoves.some(([x, y]) => fromDb[x] === a && fromDb[y] === b);
      expect(found, `${a} → ${b} in app.status_transitions`).toBe(true);
    }
  });
  it("every database move is an app move or stays on the same app status", () => {
    for (const [x, y] of dbMoves) {
      const a = fromDb[x]!;
      const b = fromDb[y]!;
      expect(a, `db status ${x}`).toBeDefined();
      expect(b, `db status ${y}`).toBeDefined();
      if (a !== b) expect(canMoveEstimate(a, b), `db ${x} → ${y} = app ${a} → ${b}`).toBe(true);
    }
  });
});

describe("canChangeEstimateCategory (T2, S16)", () => {
  it("the office and the director change it until the client signs", () => {
    for (const role of ["director", "dispatcher", "sales"] as const) {
      expect(canChangeEstimateCategory("draft", role)).toBe(true);
      expect(canChangeEstimateCategory("sent", role)).toBe(true);
      for (const s of ["awaiting_countersign", "approved", "declined"] as const) expect(canChangeEstimateCategory(s, role)).toBe(false);
    }
  });
  it("a tech only in a draft", () => {
    expect(canChangeEstimateCategory("draft", "tech")).toBe(true);
    for (const s of ESTIMATE_STATUSES.filter((x) => x !== "draft")) expect(canChangeEstimateCategory(s, "tech")).toBe(false);
  });
});
