/**
 * The name of an invoice inside the app (#1427 051/052). The stored title is what the client reads, in the client's language
 * (rule 7: «Deposit», «Depósito», «Final balance»). When it is only the default name of the invoice's kind, the app shows that
 * kind in its own language («Депозит» in the RU app, dictionary 6.6); a title someone wrote («Rough-in») is shown as written.
 * Pure; tested in test/texts1427.test.ts.
 */
import type { DictKey } from "@/i18n";
import { translate, type Lang } from "@/i18n/translate";
import type { Invoice } from "@/data/types";

const LANGS: Lang[] = ["en", "es", "ru"];
const kindKey = (kind: Invoice["kind"]): DictKey => (kind === "deposit" ? "inv.kind.deposit" : kind === "progress" ? "inv.kind.progress" : "inv.kind.final");
/** the default names of a kind in every language (the deposit is also named by `path.inv.deposit` when a signature makes it) */
const defaults = (kind: Invoice["kind"]): Set<string> =>
  new Set(LANGS.flatMap((l) => [translate(l, kindKey(kind)), ...(kind === "deposit" ? [translate(l, "path.inv.deposit")] : [])]).map((s) => s.trim().toLowerCase()));

export function invoiceTitle(inv: Pick<Invoice, "kind" | "title">, t: (k: DictKey) => string): string {
  const title = inv.title?.trim();
  if (!title || defaults(inv.kind).has(title.toLowerCase())) return t(kindKey(inv.kind));
  return title;
}
