/** Import clients from CSV (13 §3.16, 15-flows §1.13, 04 §12.5): parsing, the columns, duplicates, the limit. */
import { describe, expect, it } from "vitest";
import { guessMapping, IMPORT_MAX_ROWS, parseCsv, planImport, rowsOf, type ImportRow } from "../src/features/client/csvImport";
import type { Customer } from "../src/data/types";

describe("parseCsv", () => {
  it("quotes, commas and line breaks inside quotes, doubled quotes, CRLF, BOM, empty lines", () => {
    const t = '﻿Name,Address,Note\r\n"Kim, David","12 ""Oak"" St\nApt 2",x\r\n\r\nAnn,1 Elm,\n';
    expect(parseCsv(t)).toEqual([
      ["Name", "Address", "Note"],
      ["Kim, David", '12 "Oak" St\nApt 2', "x"],
      ["Ann", "1 Elm", ""],
    ]);
  });
  it("«;» and tab from Excel in other locales", () => {
    expect(parseCsv("Имя;Телефон\nАнна;310-555-0101")).toEqual([["Имя", "Телефон"], ["Анна", "310-555-0101"]]);
    expect(parseCsv("Name\tPhone\nAnn\t310 555 0101")).toEqual([["Name", "Phone"], ["Ann", "310 555 0101"]]);
  });
  it("a «;» inside a quoted cell does not make it the delimiter", () => {
    expect(parseCsv('"a;b",c\n1,2')).toEqual([["a;b", "c"], ["1", "2"]]);
  });
});

describe("guessMapping", () => {
  it("English export (Jobber-like)", () => {
    expect(guessMapping(["First Name", "Last Name", "Company Name", "Mobile Phone", "Email", "Street Address", "City", "Notes"])).toEqual({
      firstName: 0, lastName: 1, company: 2, phone: 3, email: 4, address: 5, city: 6,
    });
  });
  it("Russian and Spanish headers", () => {
    expect(guessMapping(["Фамилия", "Имя", "Телефон", "Почта", "Адрес", "Город"])).toEqual({ lastName: 0, firstName: 1, phone: 2, email: 3, address: 4, city: 5 });
    expect(guessMapping(["Nombre completo", "Teléfono", "Correo", "Dirección", "Ciudad"])).toEqual({ name: 0, phone: 1, email: 2, address: 3, city: 4 });
  });
  it("one full-name column; unknown columns are left out; a column is used once", () => {
    expect(guessMapping(["Customer", "Phone", "Phone", "Whatever"])).toEqual({ name: 0, phone: 1 });
  });
});

const row = (x: Partial<ImportRow>): ImportRow => ({ line: 2, name: "A", phone: "", address: "", city: "", ...x });

describe("rowsOf", () => {
  it("shown name: «First Last», else the full name, else the company; lines count from the header", () => {
    const t = [["First", "Last", "Name", "Company", "Phone"], ["Ann", "Lee", "", "", "1"], ["", "", "Bob Ray", "", "2"], ["", "", "", "Acme LLC", "3"]];
    const r = rowsOf(t, guessMapping(t[0]!));
    expect(r.map((x) => [x.line, x.name])).toEqual([[2, "Ann Lee"], [3, "Bob Ray"], [4, "Acme LLC"]]);
    expect(r[0]).toMatchObject({ firstName: "Ann", lastName: "Lee", phone: "1" });
  });
});

describe("planImport", () => {
  const db = {
    customers: [
      { id: "c1", name: "Sarah Mitchell", phone: "(626) 555-0142", email: "sarah@example.com" } as Customer,
      {
        id: "c2", name: "Kim Family", phone: "",
        people: [{ id: "p1", name: "Kim", role: "main", phones: [{ number: "+1 818 555 0187", label: "mobile", primary: true }], emails: [] }, { id: "p2", name: "Jae", role: "other", phones: [{ number: "818-555-0190", label: "mobile" }], emails: [{ address: "Jae@Kim.com" }] }],
      } as unknown as Customer,
    ],
  };
  it("skips a client already there by ANY phone or email of any of their people (the mergePeople rule)", () => {
    const p = planImport(db, [
      row({ line: 2, name: "Sara M", phone: "626.555.0142" }),
      row({ line: 3, name: "Jae", email: "jae@kim.com" }),
      row({ line: 4, name: "J", phone: "8185550190" }),
      row({ line: 5, name: "New One", phone: "310 555 0101" }),
    ]);
    expect(p.add.map((r) => r.line)).toEqual([5]);
    expect(p.skip.map((s) => [s.row.line, s.reason, s.who])).toEqual([[2, "dupClient", "Sarah Mitchell"], [3, "dupClient", "Kim Family"], [4, "dupClient", "Kim Family"]]);
  });
  it("skips a repeat inside the same file (the first one stays)", () => {
    const p = planImport(db, [row({ line: 2, name: "Ann", phone: "310-555-0101" }), row({ line: 3, name: "Ann again", phone: "+1 (310) 555-0101" }), row({ line: 4, name: "Ann mail", email: "ANN@x.com" }), row({ line: 5, name: "Ann mail 2", email: "ann@x.com " })]);
    expect(p.add.map((r) => r.line)).toEqual([2, 4]);
    expect(p.skip.map((s) => [s.row.line, s.reason, s.who])).toEqual([[3, "dupFile", "Ann"], [5, "dupFile", "Ann mail"]]);
  });
  it("needs a name and a way to reach them; a short phone or a broken email is not guessed", () => {
    const p = planImport(db, [row({ name: "" , phone: "3105550101" }), row({ name: "No contact" }), row({ name: "Short", phone: "555-0101" }), row({ name: "Bad", email: "not-an-email" }), row({ name: "Mail only", email: "m@x.io" })]);
    expect(p.skip.map((s) => s.reason)).toEqual(["noName", "noContact", "badPhone", "badEmail"]);
    expect(p.add.map((r) => r.name)).toEqual(["Mail only"]);
  });
  it(`at most ${IMPORT_MAX_ROWS} clients at once, the rest are skipped and said so`, () => {
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 3 }, (_, i) => row({ line: i + 2, name: `N${i}`, phone: `310${String(i).padStart(7, "0")}` }));
    const p = planImport({ customers: [] }, rows);
    expect(p.add).toHaveLength(IMPORT_MAX_ROWS);
    expect(p.skip.filter((s) => s.reason === "overLimit")).toHaveLength(3);
  });
});
