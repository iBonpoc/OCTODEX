import type { BillingAddress, Property } from "@/data/types";
import { shortAddress } from "./shortAddress";

/**
 * Which address a client's row in the list shows (founder 27.11, #3033: «адрес… в приоритете, если это адрес для выставления счетов.
 * Если… нет и у нас одна недвижимость, то адрес одной недвижимости»):
 * (а) the billing address, when the client has one;
 * (б) else one property — its address (then the billing address is the same one);
 * (в) several properties and no billing address — the first property's address and «ещё N» (crm-review, спорно А/Б);
 * nothing — no line (never «—»). The street and the town, without the state and the ZIP (shortAddress).
 */
export function clientListAddress(
  billing: BillingAddress | undefined,
  props: readonly Pick<Property, "address" | "city">[],
  more: (n: number) => string,
): string | undefined {
  if (billing?.line1 || billing?.city) return shortAddress(billing.line1, billing.city);
  const first = props[0];
  if (!first) return undefined;
  const one = shortAddress(first.address, first.city);
  if (props.length === 1 || !one) return one;
  return `${one} · ${more(props.length - 1)}`;
}
