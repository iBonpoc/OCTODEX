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
import { catalogUnitPrice } from "@/features/estimateDoc";

/** the version of the key: a new set of the group's properties is `v2`, and the transition offers the items again (§4.3) */
export const GROUP_KEY_VERSION = "v1";

/** a gutter part's item of a colour: a material of the module's parts with a colour (an item without a colour is never in a group, §9 Б2) */
export const colouredPart = (it: CatalogItem): boolean =>
  it.kind === "material" && !!it.attributes?.color?.trim() && PART_WORDS.has(it.attributes?.part ?? "");

/** never in the group's key: the colour itself, the service key, an old item's own mark (`custom` — §4.1: an extra property never splits a group) */
const NOT_KEY = new Set(["color", "priceGroup", "custom", "side"]);
/** the properties that make the group: the item's without the colour (and the marks above); a colour without `finish` is painted */
export function groupAttrs(attrs: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) if (!NOT_KEY.has(k)) out[k] = v;
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

/** what one price of a group is (§4.2): the price and the placeholder, and the costs (of its source) */
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
/** why the suggested price is suggested (§7а п.3): most colours have it, or it was changed last (its day); a real price over a sample one; one price — none needed */
export type Why = { k: "most"; n: number; of: number } | { k: "last"; at?: string } | { k: "real" } | { k: "same" };

export interface TransitionGroup {
  key: string;
  /** every coloured item of the part (in the group already and outside it), the source of the suggestion first */
  items: CatalogItem[];
  /** the prices the colours have now, as the person sees them (the price and «sample»); one — the group is one price already */
  options: PriceOption[];
  /** the index of the suggested option */
  suggested: number;
  why: Why;
  /** an item of the group the database keeps already (its price is the group's): the chosen price is written there first */
  insideId?: string;
}

/** what the person sees of a price: what the estimate takes and whether it is a sample one (two costs to one price are one price, review PR3 №3) */
const priceSig = (it: CatalogItem) => `${catalogUnitPrice(it)}|${it.placeholder ? 1 : 0}`;
/** later changed first; the same moment or none — the lower id (by character code) */
export const newer = (a: CatalogItem, b: CatalogItem) => {
  const ta = a.updatedAt ?? "", tb = b.updatedAt ?? "";
  if (ta !== tb) return ta > tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};

/**
 * The groups to bring to one price (the transition): every part with a coloured item outside its group — the ones without a group yet
 * and the ones that fell out (saved by an old phone without `priceGroup`, §6 №15). The prices to choose from are of ALL its colours
 * (in the group already too): a sample price made by the module never silently wins over a real one (review PR3 №5).
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
    if (!all.some((it) => priceGroupOf(it) !== key)) continue;
    const inside = all.filter((it) => priceGroupOf(it) === key);
    const sigs = new Map<string, CatalogItem[]>();
    for (const it of all) sigs.set(priceSig(it), [...(sigs.get(priceSig(it)) ?? []), it]);
    const options = [...sigs.values()].map((items) => optionOf(items, [...items].sort(newer)[0]!));
    const byId = new Map(all.map((x) => [x.id, x]));
    // the suggestion: a real price before a sample one; then the price most colours have; a tie — the last changed (then the lower id)
    const real = options.filter((o) => !o.placeholder);
    const pool = real.length ? real : options;
    const most = Math.max(...pool.map((o) => o.itemIds.length));
    const top = pool.filter((o) => o.itemIds.length === most);
    // a tie: the price of the group the database keeps already (an item that fell out goes back to it), then the last changed
    const inGroup = (o: PriceOption) => o.itemIds.some((id) => priceGroupOf(byId.get(id)) === key);
    const pick = [...top].sort((a, b) => Number(inGroup(b)) - Number(inGroup(a)) || newer(byId.get(a.sourceId)!, byId.get(b.sourceId)!))[0]!;
    const suggested = options.indexOf(pick);
    const why: Why =
      options.length === 1 ? { k: "same" }
      : real.length === 1 && options.length > 1 ? { k: "real" }
      : top.length === 1 && most > 1 ? { k: "most", n: most, of: all.length }
      : inGroup(pick) ? { k: "same" }
      : { k: "last", at: byId.get(pick.sourceId)!.updatedAt };
    const src = byId.get(pick.sourceId)!;
    out.push({ key, items: [src, ...all.filter((x) => x.id !== src.id)], options, suggested, why, ...(inside.length ? { insideId: [...inside].sort(newer)[0]!.id } : {}) });
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

/** the chosen price as a group's price write (the store's `saveGroupPrice`): the costs only for who sees them */
export function groupPriceOf(g: TransitionGroup, choice: number, seesCosts: boolean) {
  const opt = g.options[choice] ?? g.options[g.suggested]!;
  return { priceCents: opt.priceCents, placeholder: opt.placeholder, ...(seesCosts ? { costCents: opt.costCents, vendorTaxBps: opt.vendorTaxBps, markupBps: opt.markupBps } : {}) };
}

/**
 * «Сделать одну цену» for one group: the items to save. A group the database keeps already (`insideId`) gets the chosen price FIRST
 * (the screen writes `groupPriceOf` to it — the store's group write), then the others join it and take that price (on the phone and on
 * the server, `joinedGroup` / t29). No group yet: the source first (it starts the group with the chosen price), the others join it.
 * Only the group key and the shared price fields change; supplier, its code, the purchase unit and the pack stay each colour's own
 * (§4.2) — and the store writes only the changed fields. Costs go only for who sees them (`seesCosts`).
 */
export function transitionWrites(g: TransitionGroup, choice: number, seesCosts: boolean): CatalogItem[] {
  const opt = g.options[choice] ?? g.options[g.suggested]!;
  const price = groupPriceOf(g, choice, seesCosts);
  const first = g.insideId ?? opt.sourceId;
  const ordered = [g.items.find((x) => x.id === first)!, ...g.items.filter((x) => x.id !== first)];
  return ordered
    .filter((it) => !(g.insideId && priceGroupOf(it) === g.key))
    .map((it) => ({ ...it, attributes: { ...(it.attributes ?? {}), priceGroup: g.key }, ...price }));
}
