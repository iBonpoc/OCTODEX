/**
 * List cards (docs/specs/06-list-cards.md, «Правила раскладки»): pure layout rules, no React.
 * One order of fact lines for every card, short fixed-length facts in pairs, contact buttons in one order.
 * Unit-tested in test/listCardLayout.test.ts.
 */
import type { IconKey } from "./primitives";

/** Fact lines a card can show. A list decides WHICH facts it passes, never their order. */
export const FACT_ORDER = [
  // 1. who and how to reach: document number + phone (pair), client, email, address
  "num", "client", "phone", "email", "addr",
  // 2. what: source, client request, work, property type, order lines, description
  "src", "svc", "work", "kind", "lines", "desc",
  // 3. when: schedule, date, next, due, valid until, delivery
  "sched", "when", "next", "due", "valid", "deliv",
  // 4. who does it: responsible, who, where now, hours
  "resp", "by", "now", "hours",
  // 5. links and the rest
  "links", "supplier", "stock", "method", "pay", "receipt", "bill", "terms", "price", "lic", "coi", "access", "history", "last", "ref", "vis", "note",
] as const;
export type FactKey = (typeof FACT_ORDER)[number];
export type Facts = Partial<Record<FactKey, string | null | undefined>>;

/** Every fact has its own icon; within one card no two facts share an icon (founder: icons only, no word labels). */
export const FACT_ICON: Record<FactKey, IconKey> = {
  num: "hash", client: "user", phone: "phone", email: "mail", addr: "pin",
  src: "megaphone", svc: "clipboard", work: "toolbox", kind: "home", lines: "checklist", desc: "note",
  sched: "repeat", when: "calendar", next: "route", due: "clock", valid: "calendar", deliv: "truck",
  resp: "userCheck", by: "users", now: "navigate", hours: "clock",
  links: "link", supplier: "truck", stock: "box", method: "wallet", pay: "wallet", receipt: "camera", bill: "dollar",
  terms: "doc", price: "tag", lic: "doc", coi: "shield", access: "key", history: "history", last: "history", ref: "hash", vis: "eye", note: "note",
};

/** Facts whose length never changes much (number, phone, date, due, stock, hours): two fit on one line. */
export const HALF: ReadonlySet<FactKey> = new Set<FactKey>(["num", "phone", "valid", "due", "stock", "hours"]);
/** Max characters of a half fact: phone 390 → 20, tablet / desktop → 30. */
export const HALF_MAX = { phone: 20, wide: 30 } as const;
/** "regular" density: at most this many lines, without description and note. */
export const REGULAR_MAX_LINES = 4;
/** A fact wraps to at most this many lines, then fades (no "…"). */
export const FACT_MAX_LINES = 3;

export type Density = "compact" | "regular" | "rich" | "row";
export type DeviceKind = "phone" | "tablet" | "desktop";
export type FactLine = { key: FactKey } | { pair: [FactKey, FactKey] };

const clean = (facts: Facts): [FactKey, string][] =>
  FACT_ORDER.flatMap((k) => {
    const v = facts[k];
    return typeof v === "string" && v.trim() ? [[k, v.trim()] as [FactKey, string]] : [];
  });

/** Lines of facts in the one order; short facts paired; empty facts skipped. */
export function layoutFacts(facts: Facts, density: Density, device: DeviceKind): FactLine[] {
  if (density === "compact") return [];
  let rows = clean(facts);
  if (density === "regular") rows = rows.filter(([k]) => k !== "desc" && k !== "note");
  if (density === "row") return rows.map(([key]) => ({ key }));
  const max = device === "phone" ? HALF_MAX.phone : HALF_MAX.wide;
  const half = ([k, v]: [FactKey, string]) => HALF.has(k) && v.length <= max;
  const used = new Set<FactKey>();
  const out: FactLine[] = [];
  for (const r of rows) {
    if (used.has(r[0])) continue;
    used.add(r[0]);
    if (half(r)) {
      const mate = rows.find((m) => !used.has(m[0]) && half(m));
      if (mate) {
        used.add(mate[0]);
        out.push({ pair: [r[0], mate[0]] });
        continue;
      }
    }
    out.push({ key: r[0] });
  }
  return density === "regular" ? out.slice(0, REGULAR_MAX_LINES) : out;
}

/** Desktop row: the list's columns, in the one order, only those the list asked for. */
export function rowColumns(columns: readonly FactKey[]): FactKey[] {
  return FACT_ORDER.filter((k) => columns.includes(k));
}

export interface Contact {
  phone?: string | null;
  email?: string | null;
  addr?: string | null;
}
export type ContactKind = "call" | "sms" | "map" | "email";
export interface ContactAction {
  kind: ContactKind;
  icon: IconKey;
  url: string;
  /** what the button reaches (phone, address, email) — read by the screen reader with the action */
  value: string;
}
export type OS = "ios" | "android" | "web" | "windows" | "macos";

const digits = (phone: string) => {
  const d = phone.replace(/[^\d+]/g, "");
  return d.length === 10 && !d.startsWith("+") ? `+1${d}` : d;
};
export const telUrl = (phone: string) => `tel:${digits(phone)}`;
export const smsUrl = (phone: string) => `sms:${digits(phone)}`;
/** a plain address only: no spaces, «?», «&», «#» or «,» — a lead's email from a web form must not add ?body= / &cc= (security-check 05.11) */
export const SAFE_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
export const mailUrl = (email: string) => `mailto:${encodeURIComponent(email.trim()).replace(/%40/g, "@")}`;
/** iOS → Apple Maps, everything else → Google Maps search */
export const mapsUrl = (addr: string, os: OS) =>
  os === "ios" ? `https://maps.apple.com/?q=${encodeURIComponent(addr)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;

/** Contact buttons always in this order: call, SMS, map, email. Only for what the card has. */
export function contactActions(c: Contact, os: OS): ContactAction[] {
  const out: ContactAction[] = [];
  const phone = c.phone?.trim();
  const addr = c.addr?.trim();
  const email = c.email?.trim();
  if (phone && digits(phone).replace("+", "").length >= 7) {
    out.push({ kind: "call", icon: "phone", url: telUrl(phone), value: phone });
    out.push({ kind: "sms", icon: "sms", url: smsUrl(phone), value: phone });
  }
  if (addr) out.push({ kind: "map", icon: "map", url: mapsUrl(addr, os), value: addr });
  // TODO(10а): switch to the shared mailtoHref / smsHref when «Лиды и клиенты» land it (after #101)
  if (email && SAFE_EMAIL.test(email)) out.push({ kind: "email", icon: "mail", url: mailUrl(email), value: email });
  return out;
}

/** Touch target: App Store 44 pt, Android (Google Play) 48 dp. Returns the padding to add around a control of `visible` size. */
export function touchPad(visible: number, os: OS, hit: { ios: number; android: number }): number {
  const min = os === "android" ? hit.android : hit.ios;
  return Math.max(0, (min - visible) / 2);
}

/** Edge colour only for warn / bad (spec 06 §0a, decision 3): the worst of the status and the signs. */
export function edgeTone<T extends string>(tones: (T | undefined)[]): "warn" | "bad" | undefined {
  if (tones.includes("bad" as T)) return "bad";
  if (tones.includes("warn" as T)) return "warn";
  return undefined;
}
