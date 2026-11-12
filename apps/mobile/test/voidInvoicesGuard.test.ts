/**
 * В1-5 (#1107): voided invoices live apart (DB.voidInvoices), so no sum, «к оплате», «собрано», report or «Требует
 * внимания» counts them — the director's decision 12.11 (a separate list, not a flag). Only these files may read the list:
 * the data (types, normalize, repo, seed, store, the client merge, access) and the places that show a voided invoice as such
 * (its screen, the job's statement, the client's invoices). A new reader must say why here — a sum must never read it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");
const ALLOWED = new Set([
  "app/invoice/[id].tsx",
  "cloud/repo.ts",
  "data/normalize.ts",
  "data/seed.ts",
  "data/store.tsx",
  "data/types.ts",
  "features/ContractStatement.tsx",
  "features/access.ts",
  "features/client/ClientSections.tsx",
  "features/clientDuplicates.ts",
  "features/invoice/VoidInvoice.tsx",
]);

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });

describe("voided invoices are read only where they are shown as such (В1-5)", () => {
  it("no other file reads DB.voidInvoices", () => {
    const readers = files(SRC)
      .filter((p) => /voidInvoices/.test(readFileSync(p, "utf8")))
      .map((p) => relative(SRC, p).split("\\").join("/"));
    expect(readers.filter((r) => !ALLOWED.has(r))).toEqual([]);
    expect(readers.length).toBeGreaterThan(5);
  });
  it("the sums of the store read the live list only: no voidInvoices next to a sum", () => {
    const store = readFileSync(join(SRC, "data/store.tsx"), "utf8");
    // in the store the list is only written (voidInvoice moves an invoice into it), never summed
    const lines = store.split("\n").filter((l) => l.includes("voidInvoices"));
    expect(lines.every((l) => !/reduce|sumCents|contractStatement|clientMoney/.test(l))).toBe(true);
  });
});
