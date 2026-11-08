/**
 * M8b (spec 33 П23.8): a module writes estimate lines only through the core's store — ModuleEstimateStore is a view of
 * it. The check is the type (tsc in `npm run check`): the store's shape must stay assignable, or a module's «Смета»
 * would be calling something the store no longer has.
 */
import { describe, expectTypeOf, it } from "vitest";
import type { useStore } from "../src/data/store";
import type { ModuleEstimateStore, ModuleStore } from "../src/modules/registry";

describe("ModuleEstimateStore", () => {
  it("the core's store is a ModuleEstimateStore (and so a ModuleStore)", () => {
    expectTypeOf<ReturnType<typeof useStore>>().toMatchTypeOf<ModuleEstimateStore>();
    expectTypeOf<ModuleEstimateStore>().toMatchTypeOf<ModuleStore>();
  });
});
