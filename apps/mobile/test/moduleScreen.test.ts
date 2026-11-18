import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { moduleScreen, registerModule } from "../src/modules/registry";
import gutters from "../src/modules/gutters/module";

registerModule(gutters);

// #2043: a screen named like an Object.prototype member took a function from the prototype and brought the screen down
describe("moduleScreen: only the module's own screens (#2043)", () => {
  it("С1 constructor, toString, __proto__, hasOwnProperty, valueOf → no screen («Нет такого экрана»)", () => {
    for (const s of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) expect(moduleScreen("gutters", s)).toBeUndefined();
  });
  it("С2 a real screen is still there; an unknown module or screen → none", () => {
    expect(typeof moduleScreen("gutters", "draw")).toBe("function");
    expect(moduleScreen("gutters", "nope")).toBeUndefined();
    expect(moduleScreen("nope", "draw")).toBeUndefined();
    expect(moduleScreen(undefined, "draw")).toBeUndefined();
  });
});
