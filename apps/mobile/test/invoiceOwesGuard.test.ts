/**
 * invoiceOwesGuard — what an invoice still owes is counted by the engine only (#1898, rule 8). The screens and the data
 * selectors must not write `total − paid` or `Math.max(0, total − paid)` themselves: the engine's `invoiceOwes` (one invoice)
 * and `invoicesOwe` (a list) are the one rule, so the screen, the receipt, the page of the client and the PDF show the same sum.
 * Not covered on purpose: the amount the store books for a payment (data/store.tsx; acceptPayment clamps it) and the two
 * reasoned places in ALLOWED below.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");
/** where the balance is shown or summed: the screens, the features and the selectors */
const ROOTS = [join(SRC, "app"), join(SRC, "features"), join(SRC, "data", "selectors.ts")];
/** places that may subtract, each with its reason (a new one says why here) */
const ALLOWED: Record<string, string> = {
  // what an invoice may still take ONLINE: its balance minus the payments on their way (app.invoice_online_balance) — another number
  "features/payments/advance.ts": "invoiceRoom: balance minus online payments on their way",
  // the overdue line of «Требует внимания»: guarded by `continue` when paid ≥ total; to move to invoiceOwes with the next change of attention.ts (shared file)
  "features/attention.ts": "overdue amount, guarded by paid < total above",
};

const files = (p: string): string[] =>
  statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => files(join(p, f))) : /\.(ts|tsx)$/.test(p) ? [p] : [];

/** `x.totalCents - x.paidCents` in any spelling, with or without Math.max(0, …) around it */
export const OWES_BY_HAND = /\b\w*total\w*\s*-\s*\(?\s*[\w.]*paid\w*|\b[\w.]*paid\w*\s*-\s*\(?\s*[\w.]*total\w*/i;

export function handCounts(src: string): string[] {
  const code = src.split("\n").map((l, i) => ({ n: i + 1, l: l.replace(/\/\/.*$/, "") }));
  return code.filter((x) => OWES_BY_HAND.test(x.l)).map((x) => `${x.n}: ${x.l.trim()}`);
}

describe("the balance of an invoice is the engine's (#1898)", () => {
  it("no screen and no selector counts total − paid by hand", () => {
    const bad = ROOTS.flatMap((r) => files(r))
      .filter((f) => !(relative(SRC, f).split("\\").join("/") in ALLOWED))
      .flatMap((f) => handCounts(readFileSync(f, "utf8")).map((l) => `${relative(SRC, f)}:${l}`));
    expect(bad).toEqual([]);
  });
  it("the fixtures: the hand counts are caught, the engine call is not", () => {
    expect(handCounts("const bal = Math.max(0, inv.totalCents - inv.paidCents);")).toHaveLength(1);
    expect(handCounts("value={money(Math.max(0, i.totalCents - i.paidCents))}")).toHaveLength(1);
    expect(handCounts("amountCents={payingInv.totalCents - payingInv.paidCents}")).toHaveLength(1);
    expect(handCounts("const left = inv.paidCents - inv.totalCents;")).toHaveLength(1); // the other order
    expect(handCounts("const owe = total - paid;")).toHaveLength(1); // plain names
    expect(handCounts("const owe = inv.totalCents - (x.paidCents);")).toHaveLength(1);
    expect(handCounts("const bal = invoiceOwes(inv);")).toHaveLength(0);
    expect(handCounts("const totalTax = taxCents - discountCents;")).toHaveLength(0); // not a balance
    expect(handCounts("// the old way: inv.totalCents - inv.paidCents\nconst b = invoiceOwes(inv);")).toHaveLength(0);
  });
});
