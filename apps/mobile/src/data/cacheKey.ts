/**
 * The cloud cache on the phone belongs to one person in one company (#864, X-04): `octo.cloud.v1.<company>.<user>`.
 * On a shared phone the next person never reads another person's copy; once their own cache is read, every other
 * person's copy and the older ones without a person (`octo.cloud.v1.<company>`) leave the device — the server has them.
 * The refused money changes (`octo.cloud.v1.rejected`) share the prefix but are not a cache: kept (by owner, #263).
 */
import { REJECTED_KEY } from "./outboxOwner";

export const CLOUD_CACHE_PREFIX = "octo.cloud.v1.";
export const cloudCacheKey = (companyId: string, userId: string) => `${CLOUD_CACHE_PREFIX}${companyId}.${userId}`;

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
