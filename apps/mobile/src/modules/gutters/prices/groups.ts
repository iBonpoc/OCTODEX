/**
 * «Одна цена на все цвета» (#1913, spec 33-gutters-price-key §4.1, §4.3, §4.4 п.2; PR3): the module's rule that a gutter part costs the
 * same in every colour. The core knows only `attributes.priceGroup` (items with one group have one price — the database keeps it, PR1);
 * WHICH items are one group is the module's: the same part (its properties without the colour, a colour meaning «painted») and unit.
 *
 * The company's items before the change have no group: the price screen gathers them ONCE (the transition) — the groups whose colours
 * already cost the same in one tap, the others by a person's choice of the price (the one suggested says why: most colours have it,
 * or it was changed last — never silently «the lower one»). Pure: test/gutterPriceGroup.test.ts.
 */
import type { CatalogItem } from "@/data/types";
import { priceGroupOf } from "@/data/priceGroup";
import { PART_WORDS } from "../prices";
import { sha1Hex } from "../uuid5";

/** the version of the key: a new set of the group's properties is `v2`, and the transition offers the items again (§4.3) */
export const GROUP_KEY_VERSION = "v1";

/** a gutter part's item of a colour: a material of the module's parts with a colour (an item without a colour is never in a group, §9 Б2) */
export const colouredPart = (it: CatalogItem): boolean =>
  it.kind === "material" && !!it.attributes?.color?.trim() && PART_WORDS.has(it.attributes?.part ?? "");

/** the properties that make the group: the item's without the colour (and without the service `priceGroup`); a colour without `finish` is painted */
export function groupAttrs(attrs: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (k !== "color" && k !== "priceGroup") out[k] = v;
  if (attrs.color?.trim() && !out.finish) out.finish = "painted";
  return out;
}

/** the readable key of a group (before the hash): unit and the sorted properties */
export function groupText(it: Pick<CatalogItem, "unit" | "attributes">): string {
  const a = groupAttrs(it.attributes ?? {});
  return [it.unit.trim().toLowerCase(), ...Object.keys(a).sort().map((k) => `${k}=${a[k]}`)].join("|");
}

/** `attributes.priceGroup` of a coloured part: «gutters:v1:<16 hex of sha1>» — within the 120 characters of the database's check */
export const priceGroupKey = (it: Pick<CatalogItem, "unit" | "attributes">): string => `gutters:${GROUP_KEY_VERSION}:${sha1Hex(groupText(it)).slice(0, 16)}`;

/** what one price of a group is (§4.2): the price and the placeholder, and the costs */
export interface PriceOption {
  priceCents: number;
  placeholder: boolean;
  costCents?: number;
  vendorTaxBps?: number;
  markupBps?: number;
  /** the items that have it now */
  itemIds: string[];
  /** the item it is taken from: the last changed of them (then the lower id) */
  sourceId: string;
}
/** why the suggested price is suggested (§7а п.3): most colours have it, or it was changed last (its day); one price — none needed */
export type Why = { k: "most"; n: number; of: number } | { k: "last"; at?: string } | { k: "same" };

export interface TransitionGroup {
  key: string;
  /** the items of the group, the source of the suggestion first */
  items: CatalogItem[];
  /** the prices the colours have now; one — the group is one price already */
  options: PriceOption[];
  /** the index of the suggested option */
  suggested: number;
  why: Why;
}

const priceSig = (it: CatalogItem) =>
  JSON.stringify([it.priceCents, !!it.placeholder, it.costCents ?? null, it.vendorTaxBps ?? null, it.markupBps ?? null]);
/** later changed first; the same moment or none — the lower id (by character code) */
const newer = (a: CatalogItem, b: CatalogItem) => {
  const ta = a.updatedAt ?? "", tb = b.updatedAt ?? "";
  if (ta !== tb) return ta > tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * The groups to bring to one price (the transition): coloured parts without a group, by their group; and an item that fell out of its
 * group (saved by an old phone without `priceGroup`, §6 №15) — it goes back with the group's price. A group of one colour alone is
 * offered too (a colour added later finds its group), unless it is the only item of the part and already in the group.
 */
export function transitionGroups(catalog: readonly CatalogItem[]): TransitionGroup[] {
  const byKey = new Map<string, CatalogItem[]>();
  for (const it of catalog) {
    if (!colouredPart(it)) continue;
    const key = priceGroupKey(it);
    byKey.set(key, [...(byKey.get(key) ?? []), it]);
  }
  const out: TransitionGroup[] = [];
  for (const [key, all] of byKey) {
    const outside = all.filter((it) => priceGroupOf(it) !== key);
    if (!outside.length) continue;
    const inside = all.filter((it) => priceGroupOf(it) === key);
    // a group the database keeps already: its price is the one (the items outside join it, nothing to choose)
    if (inside.length) {
      const src = [...inside].sort(newer)[0]!;
      const opt = optionOf([src], src);
      out.push({ key, items: [src, ...all.filter((x) => x.id !== src.id)], options: [{ ...opt, itemIds: inside.map((x) => x.id) }], suggested: 0, why: { k: "same" } });
      continue;
    }
    const sigs = new Map<string, CatalogItem[]>();
    for (const it of all) sigs.set(priceSig(it), [...(sigs.get(priceSig(it)) ?? []), it]);
    const options = [...sigs.values()].map((items) => {
      const src = [...items].sort(newer)[0]!;
      return optionOf(items, src);
    });
    // the suggestion: the price most colours have; a tie or all different — the last changed (then the lower id)
    const most = Math.max(...options.map((o) => o.itemIds.length));
    const top = options.filter((o) => o.itemIds.length === most);
    const byId = new Map(all.map((x) => [x.id, x]));
    const last = [...top].sort((a, b) => newer(byId.get(a.sourceId)!, byId.get(b.sourceId)!))[0]!;
    const suggested = options.indexOf(last);
    const why: Why = options.length === 1 ? { k: "same" } : top.length === 1 && most > 1 ? { k: "most", n: most, of: all.length } : { k: "last", at: byId.get(last.sourceId)!.updatedAt };
    const src = byId.get(last.sourceId)!;
    out.push({ key, items: [src, ...all.filter((x) => x.id !== src.id)], options, suggested, why });
  }
  // the groups to choose first, then the ones already of one price; within them by the key (a stable order on every phone)
  return out.sort((a, b) => Number(a.options.length === 1) - Number(b.options.length === 1) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

function optionOf(items: CatalogItem[], src: CatalogItem): PriceOption {
  return {
    priceCents: src.priceCents,
    placeholder: !!src.placeholder,
    ...(src.costCents != null ? { costCents: src.costCents } : {}),
    ...(src.vendorTaxBps != null ? { vendorTaxBps: src.vendorTaxBps } : {}),
    ...(src.markupBps != null ? { markupBps: src.markupBps } : {}),
    itemIds: items.map((x) => x.id),
    sourceId: src.id,
  };
}

/**
 * «Сделать одну цену» for one group: the items to save, the source first (it starts the group with the price it has; the others join it
 * and take its price — on the phone and on the server, `joinedGroup` / t29). Only the group key and the shared price fields change;
 * supplier, its code, the purchase unit and the pack stay each colour's own (§4.2) — and the store writes only the changed fields.
 * Costs go only for who sees them (`seesCosts`); for anyone else every cost field stays as the item has it.
 */
export function transitionWrites(g: TransitionGroup, choice: number, seesCosts: boolean): CatalogItem[] {
  const opt = g.options[choice] ?? g.options[g.suggested]!;
  const src = g.items.find((x) => x.id === opt.sourceId)!;
  const ordered = [src, ...g.items.filter((x) => x.id !== src.id)];
  return ordered.map((it) => ({
    ...it,
    attributes: { ...(it.attributes ?? {}), priceGroup: g.key },
    priceCents: opt.priceCents,
    placeholder: opt.placeholder,
    ...(seesCosts ? { costCents: opt.costCents, vendorTaxBps: opt.vendorTaxBps, markupBps: opt.markupBps } : {}),
  }));
}
