import { describe, expect, it } from "vitest";
import { signedAction } from "@/features/visitSignedAction";
import type { Role } from "@/data/types";

// #2018 С3: «Подпись» × (the right to take the payment: yes / no) × (to pay: 0 / > 0) — every cell has an action
describe("visit «Подпись»: an action in every cell (#2018 С3)", () => {
  const roles: Role[] = ["director", "dispatcher", "tech", "sales"];
  it("nothing to pay: «Закрыть выезд» for everyone", () => {
    for (const r of roles) expect(signedAction(r, 0)).toBe("close");
    expect(signedAction("tech", -100)).toBe("close");
  });
  it("something to pay, the right to take it: «Принять оплату»", () => {
    for (const r of ["director", "dispatcher", "tech"] as Role[]) expect(signedAction(r, 4200)).toBe("pay");
  });
  it("something to pay, no right (sales): the office takes it, the visit closes", () => {
    expect(signedAction("sales", 4200)).toBe("closeOffice");
  });
  it("no cell is left without an action", () => {
    for (const r of roles) for (const due of [0, 1, 42000]) expect(["pay", "close", "closeOffice"]).toContain(signedAction(r, due));
  });
});
