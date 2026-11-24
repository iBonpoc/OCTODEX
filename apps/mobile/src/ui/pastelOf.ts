/**
 * The pastel of a person's initials (visual v2 «Смета, редактор» №5: «LA» on peach): one of palette A's four, chosen by the name
 * so the same client always has the same one. Pure; unit-tested in test/pastelOf.test.ts.
 */
import type { PastelName } from "@octo/design-tokens";

const ORDER: readonly PastelName[] = ["lav", "mint", "butter", "peach"];

export function pastelOf(name: string): PastelName {
  let h = 0;
  for (const ch of name.trim()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ORDER[h % ORDER.length]!;
}
