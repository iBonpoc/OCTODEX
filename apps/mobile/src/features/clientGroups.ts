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
