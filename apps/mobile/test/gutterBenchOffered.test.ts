/**
 * #1426 (design audit 14.11: «стенд „Проверка скорости“ виден владельцу»; DS §12.8 — a developer's screen): the speed check is
 * offered in Expo Go (the founder's way to run it, spec 33) and in a development build — never in the store app or on the web.
 */
import { describe, expect, it } from "vitest";
import { benchOffered } from "../src/modules/gutters/bench/visible";

describe("«Проверка скорости» — where it is offered", () => {
  it("Expo Go (storeClient) and a dev build: yes", () => {
    expect(benchOffered("storeClient", false)).toBe(true);
    expect(benchOffered("bare", true)).toBe(true);
    expect(benchOffered(undefined, true)).toBe(true);
  });
  it("the store build (standalone / bare) and the web export: no", () => {
    expect(benchOffered("standalone", false)).toBe(false);
    expect(benchOffered("bare", false)).toBe(false);
    expect(benchOffered(undefined, false)).toBe(false);
  });
});
