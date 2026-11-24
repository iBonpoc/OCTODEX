/**
 * #2014: the clients list is grouped by the first letter of the name. A client with an empty name (a CSV import, the server,
 * an old version) took `name[0]!` and brought the whole list down. The key is now the first letter of the trimmed name, in
 * upper case; a name that is empty or starts with something that is not a letter (a digit, an emoji, a sign) goes to «#».
 */
export const OTHER_GROUP = "#";

export function groupKey(name: string | null | undefined): string {
  const first = Array.from((name ?? "").trim())[0];
  if (!first || !/\p{L}/u.test(first)) return OTHER_GROUP;
  return first.toLocaleUpperCase("en-US");
}

/** the list's groups in the list's own order (the first time a key is met) */
export function groupByLetter<T extends { name?: string | null }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const c of list) {
    const k = groupKey(c.name);
    const g = m.get(k);
    if (g) g.push(c);
    else m.set(k, [c]);
  }
  return [...m];
}

/**
 * Letters only from 50 clients (wireframes-v2 «Клиенты»: «буквы-разделители — с 50 клиентов»): a short list is ONE group of rows 56
 * in one card — not a card and a letter for each client (audit 2.1: 115 pt a client). From 50 — the letters, each group its card.
 */
export const LETTERS_FROM = 50;

export function clientListGroups<T extends { name?: string | null }>(list: T[]): { key: string; title?: string; rows: T[] }[] {
  if (list.length < LETTERS_FROM) return list.length ? [{ key: "all", rows: list }] : [];
  return groupByLetter(list).map(([letter, rows]) => ({ key: letter, title: letter, rows }));
}
