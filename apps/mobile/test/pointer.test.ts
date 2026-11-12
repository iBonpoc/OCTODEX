import { afterEach, describe, expect, it, vi } from "vitest";
import { gesture } from "@octo/design-tokens";

vi.mock("react-native", () => ({ Platform: { OS: "web" } }));

describe("the kind of pointer decides how a drag starts, not the width (#1245 Б2)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it("a mouse (fine pointer on the web): a move of dragStart; a finger: a hold — never a bare move that would steal the scroll", async () => {
    const { holdConfig } = await import("../src/ui/pointer");
    expect(holdConfig(true)).toEqual({ minDistance: gesture.dragStart });
    expect(holdConfig(false)).toEqual({ activateAfterLongPress: gesture.dragHoldMs });
    expect(holdConfig(false)).not.toHaveProperty("minDistance");
  });
  it("the web asks the media query: a laptop with a mouse is fine, an iPad with a finger is not (whatever its width)", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: /pointer: fine/.test(q) }));
    expect((await import("../src/ui/pointer")).finePointer()).toBe(true);
    vi.resetModules();
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect((await import("../src/ui/pointer")).finePointer()).toBe(false);
  });
});
