/**
 * One word of an invoice's status everywhere (#1495, #1728): the job's statement, the client's and the property's sections
 * and the invoice card all take it from `invoiceChip`, and an overdue invoice says «Просрочен N дн» — never a bare
 * «Просрочено» in one place and «Просрочен N дн» in another. EN has no plural forms in it («1 days overdue» was wrong).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ru } from "@/i18n/ru";
import { en } from "@/i18n/en";
import { es } from "@/i18n/es";

const src = (p: string) => readFileSync(join(__dirname, "../src", p), "utf8");
const users = ["features/ContractStatement.tsx", "features/client/ClientSections.tsx", "features/client/PropertySections.tsx", "features/invoice/InvoiceCard.tsx"];

describe("invoiceChip — one word of status", () => {
  it("an overdue invoice gets the days sign with its number of days", () => {
    const s = src("features/ContractStatement.tsx");
    const fn = s.slice(s.indexOf("export function invoiceChip"), s.indexOf("\n}\n", s.indexOf("export function invoiceChip")));
    expect(fn).toMatch(/isOverdue\(i\.dueDate\)\) return \{ s: "bad", l: "card\.sign\.overdueDays", p: \{ d: daysOverdue\(i\.dueDate\) \} \}/);
    expect(fn).not.toMatch(/st\.overdue/);
  });
  it.each(users)("%s shows the chip with its params", (p) => {
    const s = src(p);
    expect(s).toMatch(/invoiceChip\(/);
    // every label made from the chip passes its params: const x = invoiceChip(…) → t(x.l, x.p)
    const names = [...s.matchAll(/const (\w+) = invoiceChip\(/g)].map((m) => m[1]!);
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      expect(s, `${p}: ${n} is shown`).toContain(`t(${n}.l, ${n}.p)`);
      expect(s, `${p}: t(${n}.l) without ${n}.p`).not.toContain(`t(${n}.l)`);
    }
  });
  it("the days sign reads right for one day in every language (no «1 days»)", () => {
    for (const d of [ru, en, es]) {
      for (const k of ["card.sign.overdueDays", "inv.next.overdueReminded", "inv.next.overdueNoReminder"] as const) {
        expect(d[k]).toContain("{d}");
        expect(d[k].replace("{d}", "1")).not.toMatch(/\b1 days\b/);
      }
    }
    expect(en["card.sign.overdueDays"]).toBe("Overdue {d} d");
  });
});
