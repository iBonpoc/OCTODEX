/**
 * The cloud cache on the phone belongs to one person in one company (#864, X-04): `octo.cloud.v1.<company>.<user>`.
 * On a shared phone the next person never reads another person's copy; once their own cache is read, every other
 * person's copy and the older ones without a person (`octo.cloud.v1.<company>`) leave the device — the server has them.
 * The refused money changes (`octo.cloud.v1.rejected`) share the prefix but are not a cache: kept (by owner, #263).
 */
import { REJECTED_KEY } from "./outboxOwner";
import { BROKEN_PREFIX } from "./persist";

export const CLOUD_CACHE_PREFIX = "octo.cloud.v1.";
export const cloudCacheKey = (companyId: string, userId: string) => `${CLOUD_CACHE_PREFIX}${companyId}.${userId}`;

/** `octo.cloud.v1.<company>.<user>` — this version's key (an older version's has no person) */
export const isNewCacheKey = (k: string) => k.startsWith(CLOUD_CACHE_PREFIX) && k.slice(CLOUD_CACHE_PREFIX.length).includes(".");
/** the keys of other people's (and the older person-less) cloud caches — removed once `me` has read their own */
export function othersCaches(keys: readonly string[], me: string): string[] {
  return keys.filter((k) => {
    if (!k.startsWith(CLOUD_CACHE_PREFIX) || k === REJECTED_KEY) return false;
    const rest = k.slice(CLOUD_CACHE_PREFIX.length);
    const dot = rest.indexOf(".");
    // «<company>» — an older version's cache, whose is not known; «<company>.<user>» — that person's
    return dot < 0 || rest.slice(dot + 1) !== me;
  });
}

/** the kept copies (`octo.broken.<key>.<time>`, #1189) of other people's caches and of the older person-less ones: a full
 *  snapshot of a company's data — they leave the device with the caches, never kept until that person signs in again
 *  (the security check of #1260 Б1: the director's decision) */
export function othersCopies(keys: readonly string[], me: string): string[] {
  return keys.filter((k) => {
    if (!k.startsWith(BROKEN_PREFIX)) return false;
    const src = k.slice(BROKEN_PREFIX.length, k.lastIndexOf("."));
    return othersCaches([src], me).length > 0;
  });
}
