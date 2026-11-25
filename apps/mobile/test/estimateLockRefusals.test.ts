/**
 * #2647 / #2630: the server's estimate locks answer with 22023 + a hint, never 42501. 42501 is the app's «no rights»
 * (isAccessDenied → the «доступ закрыт» flow for the whole company); one refused estimate must stay a plain refusal of its
 * op: classify → refusal (a try; dropped after MAX_TRIES), never «try later» forever, never «no rights».
 * PostgREST answers a raised 22023 with HTTP 400 and the same code and hint.
 */
import { describe, expect, it } from "vitest";
import { classify, isAccessDenied, maybeOpOnly } from "../src/data/outboxRetry";

const refusal = (hint: string) => ({ status: 400, code: "22023", hint, message: `${hint}: …` });

describe("unit:estimateLockRefusals — #2647, #2630", () => {
  for (const hint of ["estimate_property_not_assigned", "estimate_client_locked"]) {
    it(`${hint}: a plain refusal of the op, not «no rights», not «try later»`, () => {
      const e = refusal(hint);
      expect(classify(e)).toBe("refusal");
      expect(isAccessDenied(e)).toBe(false);
      expect(maybeOpOnly(e)).toBe(false);
    });
  }
  it("the same lock with 42501 would be «no rights» — why the server does not use it", () => {
    expect(isAccessDenied({ status: 403, code: "42501", hint: "estimate_property_not_assigned" })).toBe(true);
  });
});
