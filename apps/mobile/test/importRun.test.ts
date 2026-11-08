/** The run of a server import (docs/specs/04 §14.4): batches, a break and «Продолжить» without duplicates, the report. */
import { describe, expect, it } from "vitest";
import { IMPORT_BATCH, type ImportRow, type ServerRow } from "../src/features/client/csvImport";
import { canImportClients, countsOf, ImportStop, reportCsv, runImport, type ImportAnswer, type ImportDriver } from "../src/features/client/importRun";

const rows: ImportRow[] = Array.from({ length: 600 }, (_, i) => ({ line: i + 2, name: `N${i}`, phone: `310${String(i).padStart(7, "0")}`, address: "", city: "" }));

/** a server: stores every answered line; can lose the answer of one call after writing (the break of a phone) */
function fakeServer(loseAnswerOfCall?: number) {
  const stored = new Map<number, ImportAnswer>();
  let calls = 0;
  let finished = 0;
  const driver: ImportDriver = {
    async start() {
      return { nextLine: Math.max(1, ...stored.keys()) + 1 };
    },
    async batch(b: ServerRow[]) {
      calls++;
      for (const r of b) if (!stored.has(r.line)) stored.set(r.line, { line: r.line, result: "added" });
      if (calls === loseAnswerOfCall) throw new ImportStop("network");
      return b.map((r) => stored.get(r.line)!);
    },
    async finish() {
      finished++;
    },
    async undo() {
      return { undone: stored.size, kept: 0 };
    },
  };
  return { driver, stored, calls: () => calls, finished: () => finished };
}

describe("runImport", () => {
  it(`all rows in batches of ${IMPORT_BATCH}, then finish`, async () => {
    const s = fakeServer();
    const res = await runImport(s.driver, rows, 2);
    expect(res.done).toBe(true);
    expect(s.calls()).toBe(3);
    expect(s.finished()).toBe(1);
    expect(countsOf(res.answers)).toEqual({ added: 600, dupAdded: 0, skipped: 0 });
  });
  it("a break after the server wrote the second batch: stopped at its first line; «Продолжить» from the server's next line — no row twice", async () => {
    const s = fakeServer(2);
    const first = await runImport(s.driver, rows, 2);
    expect(first.done).toBe(false);
    expect(first.failure).toBe("network");
    expect(first.stoppedAt).toBe(2 + IMPORT_BATCH);
    expect(first.answers).toHaveLength(IMPORT_BATCH);
    // the screen was closed: the start of the same job says where the server is
    const st = await s.driver.start();
    expect(st.nextLine).toBe(2 + 2 * IMPORT_BATCH);
    const again = await runImport(s.driver, rows, first.stoppedAt!, first.answers);
    expect(again.done).toBe(true);
    expect(s.stored.size).toBe(600);
    expect(new Set(again.answers.map((a) => a.line)).size).toBe(again.answers.length);
    expect(again.answers).toHaveLength(600);
  });
  it("the report: every row, formulas made text", () => {
    const csv = reportCsv([{ line: 3, result: "skipped", reason: "dupClient", who: "=HYPERLINK(1)" }, { line: 2, result: "added" }], [{ line: 2, name: "Ann, Lee", phone: "", address: "", city: "" }, { line: 3, name: "@x", phone: "", address: "", city: "" }]);
    expect(csv.split("\r\n")).toEqual(["line,name,result,reason,who", '2,"Ann, Lee",added,,', "3,'@x,skipped,dupClient,'=HYPERLINK(1)"]);
  });
  it("who imports: the office, not sales nor the tech (was: everyone but the tech)", () => {
    expect((["director", "dispatcher", "sales", "tech"] as const).map(canImportClients)).toEqual([true, true, false, false]);
  });
});
