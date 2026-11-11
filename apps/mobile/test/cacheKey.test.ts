/**
 * unit:cacheKey — the cloud cache is the person's in the company (#864, X-04): whose copies leave the phone once the
 * person signed in has read their own.
 */
import { describe, expect, it } from "vitest";
import { cloudCacheKey, othersCaches } from "../src/data/cacheKey";

describe("unit:cacheKey — the cloud cache by person (#864)", () => {
  it("the key names the company and the person", () => {
    expect(cloudCacheKey("c1", "u1")).toBe("octo.cloud.v1.c1.u1");
    expect(cloudCacheKey("c1", "u1")).not.toBe(cloudCacheKey("c1", "u2"));
  });
  it("another person's copy and the older person-less ones go; mine (every company), the refused changes and other keys stay", () => {
    const keys = [
      "octo.cloud.v1.c1.u1", // mine
      "octo.cloud.v1.c2.u1", // mine, another company
      "octo.cloud.v1.c1.u2", // the director's
      "octo.cloud.v1.c1", // an older version's: whose is not known
      "octo.cloud.v1.rejected", // not a cache (by owner)
      "octo.outbox.v1",
      "octo.drafts.v1.c1.u2", // drafts are not on the server: never here (#1038)
      "octo.db.v5",
    ];
    expect(othersCaches(keys, "u1").sort()).toEqual(["octo.cloud.v1.c1", "octo.cloud.v1.c1.u2"]);
  });
});
