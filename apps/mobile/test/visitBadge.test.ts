import { describe, expect, it, vi } from "vitest";
vi.mock("@/cloud/client", () => ({ supabase: {} }));
import { visitStatus } from "../src/features/visitStatus";
import type { Visit } from "../src/data/types";

// #2055: the visit's badge on «Подпись» says what comes next — a payment only when there is money to take
const members = [{ id: "m1" }];
const visit = (patch: Partial<Visit>): Visit =>
  ({ id: "v1", jobId: "j1", kind: "work", techId: "m1", assigneeIds: ["m1"], start: new Date(Date.now() + 3600e3).toISOString(), durationMin: 60, step: "signed", scope: [], checklist: [], photos: [], amountDueCents: 0, ...patch }) as Visit;

describe("visit badge on «Подпись» (#2055)", () => {
  it("С1 something to pay: «Ждёт оплаты» (as before)", () => {
    expect(visitStatus(visit({}), members, Date.now(), undefined, 30000).label).toBe("st.awaiting");
  });
  it("С2 nothing to pay: «Подписан · закрыть», not «Ждёт оплаты»", () => {
    const s = visitStatus(visit({}), members, Date.now(), undefined, 0);
    expect(s.label).toBe("st.signedToClose");
    expect(s.status).toBe("info");
  });
  it("no amount given (an old caller): as before", () => {
    expect(visitStatus(visit({}), members).label).toBe("st.awaiting");
  });
  it("С3 a visit closed with nothing to pay is «Выполнен», not «Оплачено»", () => {
    expect(visitStatus(visit({ step: "paid", payment: { method: "card", amountCents: 0, at: "" } }), members).label).toBe("st.done");
    expect(visitStatus(visit({ step: "paid", payment: { method: "cash", amountCents: 30000, at: "" } }), members).label).toBe("st.paid");
  });
});
