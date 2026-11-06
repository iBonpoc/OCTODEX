/** Import clients from CSV (13 §3.16, 15-flows §1.13, 04 §12.5): parsing, the columns, duplicates, the limit. */
import { describe, expect, it } from "vitest";
import { cleanPhone, CsvError, guessMapping, IMPORT_MAX_CELL, IMPORT_MAX_PARSED, IMPORT_MAX_ROWS, parseCsv, planImport, rowsOf, type ImportRow } from "../src/features/client/csvImport";
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

// review #199: what real exports contain
describe("review #199: phones as people type them", () => {
  it("an extension is dropped, the first of two numbers is kept, «N/A» or «-» is no phone", () => {
    expect(cleanPhone("(310) 555-0101 ext 22")).toEqual({ phone: "(310) 555-0101", ok: true });
    expect(cleanPhone("310-555-0101 x5")).toEqual({ phone: "310-555-0101", ok: true });
    expect(cleanPhone("310 555 0101 доб. 7")).toEqual({ phone: "310 555 0101", ok: true });
    expect(cleanPhone("310-555-0101 / 818-555-0187")).toEqual({ phone: "310-555-0101", ok: true });
    expect(cleanPhone("310-555-0101 or 818-555-0187").phone).toBe("310-555-0101");
    expect(cleanPhone("+1 310 555 0101")).toEqual({ phone: "+1 310 555 0101", ok: true });
    for (const none of ["N/A", "-", "none", "", "  "]) expect(cleanPhone(none)).toEqual({ phone: "", ok: true });
  });
  it("not a US number is not guessed: 12 digits, or 11 not starting with 1, or too short", () => {
    expect(cleanPhone("310555010122").ok).toBe(false);
    expect(cleanPhone("23105550101").ok).toBe(false);
    expect(cleanPhone("555-0101").ok).toBe(false);
  });
  it("a row with «N/A» as the phone and an email is added; an extension does not hide a duplicate", () => {
    const t = [["Name", "Phone", "Email"], ["Ann", "N/A", "ann@x.io"], ["Sara", "(626) 555-0142 ext 9", ""], ["Bad", "310555010122", ""]];
    const p = planImport({ customers: [{ id: "c1", name: "Sarah Mitchell", phone: "(626) 555-0142" } as Customer] }, rowsOf(t, guessMapping(t[0]!)));
    expect(p.add.map((r) => r.name)).toEqual(["Ann"]);
    expect(p.skip.map((s) => [s.row.name, s.reason])).toEqual([["Sara", "dupClient"], ["Bad", "badPhone"]]);
  });
});

describe("review #199: broken and huge files", () => {
  it("an unclosed quote is an unreadable file, not a silent half", () => {
    expect(() => parseCsv('Name,Phone\n"Ann,310-555-0101\nBob,818-555-0187')).toThrow(CsvError);
  });
  it("a quote inside a cell (12\" pipe) is a character and does not break the delimiter", () => {
    expect(parseCsv('Item;Size\n12" pipe;5')).toEqual([["Item", "Size"], ['12" pipe', "5"]]);
  });
  it(`cells are cut to ${IMPORT_MAX_CELL} characters, at most ${IMPORT_MAX_PARSED} rows are read`, () => {
    expect(parseCsv(`Name\n${"a".repeat(1000)}`)[1]![0]).toHaveLength(IMPORT_MAX_CELL);
    const big = ["Name", ...Array.from({ length: IMPORT_MAX_PARSED + 50 }, (_, i) => `N${i}`)].join("\n");
    expect(parseCsv(big)).toHaveLength(IMPORT_MAX_PARSED + 1);
  });
});

describe("review #199: a match with an archived or «do not service» client says so", () => {
  it("whoStatus is set for archived / do not service, not for an ordinary client", () => {
    const db = { customers: [
      { id: "a", name: "Old", phone: "3105550001", status: "archived" },
      { id: "b", name: "Banned", phone: "3105550002", status: "do_not_service" },
      { id: "c", name: "Fine", phone: "3105550003" },
    ] as Customer[] };
    const p = planImport(db, [row({ name: "x", phone: "3105550001" }), row({ name: "y", phone: "3105550002" }), row({ name: "z", phone: "3105550003" })]);
    expect(p.skip.map((s) => [s.who, s.whoStatus])).toEqual([["Old", "archived"], ["Banned", "do_not_service"], ["Fine", undefined]]);
  });
});
