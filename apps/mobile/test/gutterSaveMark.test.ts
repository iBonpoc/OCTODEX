import { describe, expect, it } from "vitest";
import { SAVE_ICON, saveMark } from "../src/modules/gutters/draw/saveMark";
import { icons } from "@octo/design-tokens";

/** #507: the canvas's save mark — an icon of three states, not the words «Сохранено на телефоне». */
describe("the save mark", () => {
  it("not saved yet → nothing", () => {
    expect(saveMark({ saved: false, online: true, pending: 0 })).toBe("none");
    expect(saveMark({ saved: false, online: false, pending: 3 })).toBe("none");
  });
  it("saved, nothing waiting → sent (a cloud with a tick)", () => {
    expect(saveMark({ saved: true, online: true, pending: 0 })).toBe("sent");
  });
  it("saved, waiting, online → going out (a cloud with an arrow)", () => {
    expect(saveMark({ saved: true, online: true, pending: 2 })).toBe("sending");
  });
  it("saved, waiting, no connection → on the phone only", () => {
    expect(saveMark({ saved: true, online: false, pending: 1 })).toBe("phone");
  });
  it("every mark's icon is in the design system (Наряд)", () => {
    for (const k of Object.values(SAVE_ICON)) expect(icons).toHaveProperty(k);
    expect(icons).toHaveProperty("channel"); // the gutter profile — a neutral name in the core (nicheGuard)
  });
});
