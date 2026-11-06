/**
 * Import clients from CSV (docs/specs/13-app-structure.md §3.16, 15-flows §1.13, 04 §12.5). Pure — tested in
 * test/csvImport.test.ts. Steps: parse the file → guess which column is which (EN / RU / ES headers) → rows →
 * plan: what is added, what is skipped and why (a duplicate of a client or of an earlier row of the same file, by any
 * phone or email — the same rule as findDuplicates / mergePeople; a row without a name or a way to reach them).
 */
import { fullPhoneKey as phoneKey, peopleOf } from "@/data/people";
import type { CustomerStatus, DB } from "@/data/types";

/** at most this many rows in one import (decision of the director 06.11) */
export const IMPORT_MAX_ROWS = 500;
/** a bigger file is not read at all (a CSV of 500 clients is ~100 KB) */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
/** rows parsed at most (the rest of a huge file is not even looked at) and the longest cell kept */
export const IMPORT_MAX_PARSED = IMPORT_MAX_ROWS * 4;
export const IMPORT_MAX_CELL = 200;

/** the file is not a CSV we can read (an unclosed quote, nothing after the header) */
export class CsvError extends Error {}

export const IMPORT_FIELDS = ["firstName", "lastName", "name", "company", "phone", "email", "address", "city"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
/** field → column index (undefined = not in the file) */
export type ImportMapping = Partial<Record<ImportField, number>>;

/**
 * RFC 4180 and what spreadsheets really export: quotes ("" inside), commas / line breaks inside quotes, CRLF, a BOM,
 * «;» or a tab instead of the comma (Excel in many locales). Empty lines are dropped; cells are trimmed.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const delim = guessDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const cut = (c: string) => c.trim().slice(0, IMPORT_MAX_CELL);
  for (let i = 0; i < src.length && rows.length <= IMPORT_MAX_PARSED; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    // a quote opens a quoted cell only at its start; 12" pipe inside a cell is just a character
    if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delim) {
      row.push(cut(cell));
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cut(cell));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw new CsvError("unclosed quote");
  row.push(cut(cell));
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== "")).slice(0, IMPORT_MAX_PARSED + 1);
}

/** the delimiter of the first line (outside quotes): the most frequent of , ; tab */
function guessDelimiter(src: string): string {
  // the first line outside quoted cells (a quote counts only at the start of a cell, as in parseCsv)
  let line = "";
  let quoted = false;
  let atStart = true;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') i++;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === "\n" || ch === "\r") break;
    if (ch === '"' && atStart) {
      quoted = true;
      continue;
    }
    line += ch;
    atStart = ch === "," || ch === ";" || ch === "\t" || (atStart && ch === " ");
  }
  const count = (d: string) => line.split(d).length - 1;
  return [",", ";", "\t"].reduce((best, d) => (count(d) > count(best) ? d : best), ",");
}

/** header words people really use (Jobber, Housecall Pro, Google / iPhone contacts, Excel by hand), lower-case */
const HEADER_WORDS: Record<ImportField, string[]> = {
  firstName: ["first name", "firstname", "first", "given name", "имя", "nombre"],
  lastName: ["last name", "lastname", "last", "surname", "family name", "фамилия", "apellido", "apellidos"],
  name: ["name", "full name", "client", "customer", "client name", "customer name", "display name", "клиент", "фио", "имя и фамилия", "nombre completo", "cliente"],
  company: ["company", "company name", "organization", "business", "компания", "организация", "empresa", "compañía"],
  phone: ["phone", "phone number", "mobile", "mobile phone", "cell", "telephone", "tel", "primary phone", "телефон", "мобильный", "teléfono", "telefono", "celular", "móvil"],
  email: ["email", "e-mail", "email address", "mail", "почта", "эл. почта", "электронная почта", "correo", "correo electrónico"],
  address: ["address", "street", "street address", "address 1", "address line 1", "service address", "адрес", "улица", "dirección", "direccion", "calle"],
  city: ["city", "town", "город", "ciudad"],
};

/** which column is which, by its header; each column is used once, an exact word wins over a partial one */
export function guessMapping(header: readonly string[]): ImportMapping {
  const norm = header.map((h) => h.toLowerCase().replace(/[_*:]+/g, " ").replace(/\s+/g, " ").trim());
  const out: ImportMapping = {};
  const used = new Set<number>();
  for (const pass of ["exact", "starts"] as const)
    for (const f of IMPORT_FIELDS) {
      if (out[f] !== undefined) continue;
      const i = norm.findIndex((h, k) => !used.has(k) && HEADER_WORDS[f].some((w) => (pass === "exact" ? h === w : h.startsWith(`${w} `))));
      if (i >= 0) {
        out[f] = i;
        used.add(i);
      }
    }
  return out;
}

/**
 * A phone cell as people type it: «(310) 555-0101 ext 22», «310-555-0101 x5», two numbers «310… / 818…», «N/A», «-».
 * The extension is dropped, the first of two numbers is kept, a cell with no digits is empty. A US number is 10 digits
 * (or 11 starting with 1); anything else is kept as typed and the row is skipped as «Неполный телефон».
 */
export function cleanPhone(raw: string): { phone: string; ok: boolean } {
  const first = raw.split(/\s*(?:[;,/|]|\bor\b|\bили\b|\bo\b)\s*/i).find((x) => /\d/.test(x)) ?? "";
  const noExt = first.replace(/\s*(?:ext\.?|extension|доб\.?|x|#)\s*\d+\s*$/i, "").trim();
  const d = noExt.replace(/\D/g, "");
  if (!d) return { phone: "", ok: true };
  const ok = d.length === 10 || (d.length === 11 && d.startsWith("1"));
  return { phone: noExt, ok };
}

export interface ImportRow {
  /** 1-based line of the file (the header is line 1) — shown in «пропущено» */
  line: number;
  name: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  phone: string;
  /** false: digits are there but not a US number */
  phoneOk?: boolean;
  email?: string;
  address: string;
  city: string;
}

/** the file's rows (without the header) through the mapping; the shown name: «First Last», else the full name, else the company */
export function rowsOf(table: readonly string[][], m: ImportMapping): ImportRow[] {
  const at = (r: readonly string[], f: ImportField) => (m[f] === undefined ? "" : (r[m[f]!] ?? "").trim());
  return table.slice(1).map((r, i) => {
    const firstName = at(r, "firstName");
    const lastName = at(r, "lastName");
    const company = at(r, "company");
    const parts = [firstName, lastName].filter(Boolean).join(" ");
    const email = at(r, "email");
    const ph = cleanPhone(at(r, "phone"));
    return {
      line: i + 2,
      name: parts || at(r, "name") || company,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      company: company || undefined,
      phone: ph.phone,
      phoneOk: ph.ok,
      email: email || undefined,
      address: at(r, "address"),
      city: at(r, "city"),
    };
  });
}

export type SkipReason = "noName" | "noContact" | "badPhone" | "badEmail" | "dupClient" | "dupFile" | "overLimit";
export interface ImportPlan {
  add: ImportRow[];
  /** who: the client or the earlier row it repeats; whoStatus: that client is archived / «do not service» */
  skip: { row: ImportRow; reason: SkipReason; who?: string; whoStatus?: CustomerStatus }[];
}

const emailKey = (e: string | undefined) => (e ?? "").trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** what will be added and what skipped, before anything is written */
export function planImport(db: Pick<DB, "customers">, rows: readonly ImportRow[]): ImportPlan {
  type Hit = { name: string; status?: CustomerStatus };
  const phones = new Map<string, Hit>();
  const emails = new Map<string, Hit>();
  for (const c of db.customers)
    for (const p of peopleOf(c)) {
      const hit = { name: c.name, status: c.status };
      for (const x of p.phones) if (phoneKey(x.number)) phones.set(phoneKey(x.number), hit);
      for (const x of p.emails) if (emailKey(x.address)) emails.set(emailKey(x.address), hit);
    }
  const filePhones = new Map<string, Hit>();
  const fileEmails = new Map<string, Hit>();
  const plan: ImportPlan = { add: [], skip: [] };
  for (const row of rows) {
    const ph = row.phoneOk === false ? "" : phoneKey(row.phone);
    const em = emailKey(row.email);
    const skip = (reason: SkipReason, hit?: Hit) =>
      plan.skip.push({ row, reason, who: hit?.name, whoStatus: hit?.status === "archived" || hit?.status === "do_not_service" ? hit.status : undefined });
    const known = (ph && phones.get(ph)) || (em && emails.get(em)) || undefined;
    const repeat = (ph && filePhones.get(ph)) || (em && fileEmails.get(em)) || undefined;
    if (!row.name) skip("noName");
    else if (row.phoneOk === false || (row.phone && !ph)) skip("badPhone");
    else if (em && !EMAIL.test(em)) skip("badEmail");
    else if (!ph && !em) skip("noContact");
    else if (known) skip("dupClient", known);
    else if (repeat) skip("dupFile", repeat);
    else if (plan.add.length >= IMPORT_MAX_ROWS) skip("overLimit");
    else {
      plan.add.push(row);
      if (ph) filePhones.set(ph, { name: row.name });
      if (em) fileEmails.set(em, { name: row.name });
    }
  }
  return plan;
}
