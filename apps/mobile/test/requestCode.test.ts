/**
 * «Получить код» in the app (docs/specs/52 §8 Р10, #1756): the server makes the account, then Auth sends the code to an
 * existing account only; the function not answering falls back to the old way; a bad address is said as Auth says it.
 */
import { describe, it, expect } from "vitest";
import { requestCode, type RequestCodeDeps } from "@/cloud/requestCode";
import { signInError } from "@/features/signIn";

function deps(status: number | null | "throw", otpAnswer: string | null = null) {
  const calls: string[] = [];
  const d: RequestCodeDeps = {
    callFunction: async (e) => {
      calls.push(`fn ${e}`);
      if (status === "throw") throw new Error("Failed to fetch");
      return status;
    },
    otp: async (e, create) => (calls.push(`otp ${e} ${create}`), otpAnswer),
  };
  return { d, calls };
}

describe("requestCode", () => {
  it("the function made (or knew) the account → the code to an existing account only", async () => {
    const { d, calls } = deps(200);
    expect(await requestCode("a@b.co", d)).toBeNull();
    expect(calls).toEqual(["fn a@b.co", "otp a@b.co false"]);
  });
  it("no answer, 404 or 5xx → the old way (create on Auth), so the code still goes before the switch-off", async () => {
    for (const s of [null, 404, 503, "throw"] as const) {
      const { d, calls } = deps(s);
      expect(await requestCode("a@b.co", d)).toBeNull();
      expect(calls.at(-1), String(s)).toBe("otp a@b.co true");
    }
  });
  it("after the switch-off a new address on the old way is refused in plain words, not «the code is wrong»", async () => {
    const { d } = deps(503, "Signups not allowed for otp");
    expect(signInError(await requestCode("a@b.co", d)).key).toBe("auth.err.notAllowed");
  });
  it("the function says the address is not one → «Проверьте адрес почты», no code asked", async () => {
    const { d, calls } = deps(400);
    expect(signInError(await requestCode("a@b", d)).key).toBe("auth.err.badEmail");
    expect(calls).toEqual(["fn a@b"]);
  });
});
