/**
 * One rule for a duplicate on the phone and on the server (docs/specs/04 §14.5 №10): the same examples
 * (test/fixtures/matchKeys.json) are checked here against the app's keys and in db T139 against app.phone_key /
 * app.email_key / app.address_key and public.import_customers. A change of a rule changes the file — both sides go red.
 */
import { describe, expect, it } from "vitest";
import { fullPhoneKey } from "../src/data/people";
import { addressKey, emailKey } from "../src/features/clientDuplicates";
import { importCell, planImport, type ImportRow } from "../src/features/client/csvImport";
import type { Customer } from "../src/data/types";
import fx from "./fixtures/matchKeys.json";

const orNull = (k: string) => k || null;

describe("match keys = the server's (T139)", () => {
  it.each(fx.phones)("phone $in", (x) => expect(orNull(fullPhoneKey(x.in))).toBe(x.key));
  it.each(fx.emails)("email $in", (x) => expect(orNull(emailKey(x.in))).toBe(x.key));
  it.each(fx.addresses)("address $street, $city", (x) => {
    // a property row (zip given, even empty) has place; an import row has only the city text
    const p = x.zip !== null ? { address: x.street, unit: x.unit ?? undefined, city: x.city, place: { city: x.city, zip: x.zip } } : { address: x.street, unit: x.unit ?? undefined, city: x.city };
    expect(orNull(addressKey(p))).toBe(x.key);
  });
});

describe("import rows = the server's answers (T139, public.import_customers)", () => {
  it("every row of the example import", () => {
    const customers = fx.rows.existing.map((e, i) => ({
      id: e.id, number: `CLT-${String(i + 1).padStart(4, "0")}`, name: e.name, phone: e.phone ?? "", email: e.email ?? undefined, sourceId: "s", balanceCents: 0,
      status: e.status as Customer["status"],
    }));
    const properties = fx.rows.existing.map((e) => ({ id: `p-${e.id}`, customerId: e.id, address: e.address, city: e.city, stories: 1, place: { city: e.city, zip: e.zip } }));
    const rows: ImportRow[] = fx.rows.import.map((r) => ({ line: r.line, name: importCell(r.name), phone: r.phone, email: r.email || undefined, address: r.address, city: r.city }));
    const plan = planImport({ customers, properties }, rows);
    const got = new Map<number, Record<string, string | undefined>>();
    for (const r of plan.add) got.set(r.line, { result: "added" });
    for (const d of plan.dupAdd) got.set(d.row.line, { result: "dup_added", who: d.who });
    for (const s of plan.skip) got.set(s.row.line, { result: "skipped", reason: s.reason, who: s.who, who_status: s.whoStatus });
    for (const x of fx.rows.expect) {
      const e = x as Record<string, string | number | undefined>;
      expect({ line: x.line, ...got.get(x.line) }, `line ${x.line}`).toEqual(
        Object.fromEntries(Object.entries({ line: x.line, result: e.result, reason: e.reason, who: e.who, who_status: e.who_status }).filter(([, v]) => v !== undefined)),
      );
    }
  });
});
