/**
 * Import clients from CSV (docs/specs/13-app-structure.md §3.16, 15-flows §1.13, 04 §12.5). Pure — tested in
 * test/csvImport.test.ts. Steps: parse the file → guess which column is which (EN / RU / ES headers) → rows →
 * plan: what is added, what is added as a possible duplicate, what is skipped and why. The rule is the server's
 * (public.import_customers, docs/specs/04 §14.4; the same examples test/fixtures/matchKeys.json — this file's
 * test/csvImport.test.ts and db T139): the server writes and has the last word, this is the check before the tap.
 */
import { fullPhoneKey, peopleOf } from "@/data/people";
import type { Customer, CustomerStatus, DB, Property } from "@/data/types";
import { addressKey, CROWD, emailKey, isLiveClient } from "@/features/clientDuplicates";

/** at most this many rows in one import (decision of the founder, docs/03-prd/00-decisions-for-founder.md: up to 5,000) */
export const IMPORT_MAX_ROWS = 5000;
/** a bigger file is not read at all (PRD 04 §7.7.4: up to 10 MB) */
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
/** rows parsed at most: one more than can be imported, so «the file is longer» is known */
export const IMPORT_MAX_PARSED = IMPORT_MAX_ROWS + 1;
export const IMPORT_MAX_CELL = 200;
/** rows per server call (one transaction each, docs/specs/04 §14.4) */
export const IMPORT_BATCH = 250;

/** a control character (a line break inside a quoted cell) becomes a space; bidi and zero-width characters go; then
 *  trim — the same as app.import_cell on the server (db T139) */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const INVISIBLE = /[\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;
export const importCell = (c: string) => c.replace(CONTROL, " ").replace(INVISIBLE, "").trim();

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
  const cut = (c: string) => importCell(c).slice(0, IMPORT_MAX_CELL);
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
  /** added, but only the address matched a live client (a weak sign, §13.4): the card gets «Возможный дубль» */
  dupAdd: { row: ImportRow; who: string }[];
  /** who: the client or the earlier row it repeats; whoStatus: that client is archived / «do not service» */
  skip: { row: ImportRow; reason: SkipReason; who?: string; whoStatus?: CustomerStatus }[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** the phone the server keeps as a key: 10 digits, or 11 starting with 1; "" — no phone; null — digits, but not a US number */
function phoneOf(row: ImportRow): string | null {
  const d = row.phone.replace(/\D/g, "");
  if (!d) return "";
  return d.length === 10 || (d.length === 11 && d.startsWith("1")) ? fullPhoneKey(d) : null;
}

/**
 * What will be added and what skipped, before anything is written — the server's order (classifyImportRow there):
 * noName → badPhone → badEmail → noContact → dupClient (any phone / email of any person of a card that is not merged,
 * the oldest card) → dupFile (an earlier row of this file) → added; only the address of a live card's property (≤ CROWD
 * cards share it) — added as a possible duplicate. Rows past IMPORT_MAX_ROWS — overLimit (split the file).
 */
export function planImport(db: Pick<DB, "customers"> & Partial<Pick<DB, "properties">>, rows: readonly ImportRow[]): ImportPlan {
  type Hit = { name: string; status?: CustomerStatus };
  const phones = new Map<string, Hit>();
  const emails = new Map<string, Hit>();
  const addrs = new Map<string, Set<string>>();
  // the oldest card first (the server: created_at): the CLT number, else the list's order (it keeps the newest first)
  const num = (c: Customer) => Number(c.number?.replace(/\D/g, "") || NaN);
  const pos = new Map(db.customers.map((c, i) => [c.id, i]));
  const oldest = (a: Customer, b: Customer) => {
    const na = num(a);
    const nb = num(b);
    return Number.isFinite(na) && Number.isFinite(nb) && na !== nb ? na - nb : pos.get(b.id)! - pos.get(a.id)!;
  };
  const cards = db.customers.filter((c) => !c.mergedIntoId).sort(oldest);
  const byId = new Map(cards.map((c) => [c.id, c]));
  for (const c of cards)
    for (const p of peopleOf(c)) {
      const hit = { name: c.name, status: c.status };
      for (const x of p.phones) if (fullPhoneKey(x.number) && !phones.has(fullPhoneKey(x.number))) phones.set(fullPhoneKey(x.number), hit);
      for (const x of p.emails) if (emailKey(x.address) && !emails.has(emailKey(x.address))) emails.set(emailKey(x.address), hit);
    }
  const putAddr = (k: string, who: string) => k && addrs.set(k, (addrs.get(k) ?? new Set<string>()).add(who));
  for (const p of (db.properties ?? []) as Property[]) {
    const c = byId.get(p.customerId);
    if (c && isLiveClient(c)) putAddr(addressKey(p), `c:${c.id}`);
  }
  const names = new Map<string, string>(); // `c:<id>` / `r:<line>` → the name shown
  for (const c of cards) names.set(`c:${c.id}`, c.name);
  const filePhones = new Map<string, Hit>();
  const fileEmails = new Map<string, Hit>();
  const plan: ImportPlan = { add: [], dupAdd: [], skip: [] };
  rows.forEach((row, i) => {
    const ph = phoneOf(row);
    const em = emailKey(row.email);
    const skip = (reason: SkipReason, hit?: Hit) =>
      plan.skip.push({ row, reason, who: hit?.name, whoStatus: hit?.status === "archived" || hit?.status === "do_not_service" ? hit.status : undefined });
    const known = (ph && phones.get(ph)) || (em && emails.get(em)) || undefined;
    const repeat = (ph && filePhones.get(ph)) || (em && fileEmails.get(em)) || undefined;
    if (i >= IMPORT_MAX_ROWS) skip("overLimit");
    else if (!row.name) skip("noName");
    else if (ph === null) skip("badPhone");
    else if (em && !EMAIL.test(em)) skip("badEmail");
    else if (!ph && !em) skip("noContact");
    else if (known) skip("dupClient", known);
    else if (repeat) skip("dupFile", repeat);
    else {
      const ak = addressKey({ address: row.address, city: row.city });
      const same = ak ? addrs.get(ak) : undefined;
      const first = same && same.size <= CROWD ? [...same][0] : undefined;
      if (first) plan.dupAdd.push({ row, who: names.get(first) ?? "" });
      else plan.add.push(row);
      const me = `r:${row.line}`;
      names.set(me, row.name);
      putAddr(ak, me);
      if (ph) filePhones.set(ph, { name: row.name });
      if (em) fileEmails.set(em, { name: row.name });
    }
  });
  return plan;
}

/** the rows the server is sent (in the file's order, ≤ IMPORT_MAX_ROWS), in batches of IMPORT_BATCH */
export interface ServerRow {
  line: number; name: string; first_name: string; last_name: string; company: string; phone: string; email: string; address: string; city: string;
}
export const serverRow = (r: ImportRow): ServerRow => ({
  line: r.line, name: r.name, first_name: r.firstName ?? "", last_name: r.lastName ?? "", company: r.company ?? "",
  phone: r.phone, email: r.email ?? "", address: r.address, city: r.city,
});
export function batchesOf(rows: readonly ImportRow[], fromLine = 2): ServerRow[][] {
  const out: ServerRow[][] = [];
  const send = rows.slice(0, IMPORT_MAX_ROWS).filter((r) => r.line >= fromLine).map(serverRow);
  for (let i = 0; i < send.length; i += IMPORT_BATCH) out.push(send.slice(i, i + IMPORT_BATCH));
  return out;
}
