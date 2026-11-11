/**
 * Rule 5 guard (#805): «an irreversible action is a confirmation or a 5-second «Отменить» toast — store mutations return `undo`».
 * Every member of the store context (interface StoreCtx) in src/data/store.tsx whose name is destructive (delete/remove/discard/dismiss/cancel/clear/
 * revoke/merge/drop/reset…) must return `Undo` / `GuardedUndo`, or stand in EXEMPT with the confirmation that replaces the undo:
 * the file of the screen and a text that must still be there. An action without both is a bug (task), not an exemption.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const DESTRUCTIVE = /^(delete|remove|discard|dismiss|cancel|clear|archive|void|merge|wipe|reset|revoke|unlink|detach|drop)[A-Z]?/;

/** members of the Store type: name → return type text */
export function storeMembers(src: string): Record<string, string> {
  const start = Math.max(0, src.indexOf("interface StoreCtx"));
  const out: Record<string, string> = {};
  const lines = src.slice(start).split("\n");
  for (const l of lines.slice(1)) {
    const m = l.match(/^  ([A-Za-z]\w*): (\([^)]*\)|\(.*?\)) => (.+?);\s*(\/\/.*)?$/);
    if (m) out[m[1]!] = m[3]!;
    if (/^\}\s*$/.test(l)) break;
  }
  return out;
}

/** a destructive member that returns no Undo is allowed only with the confirmation that stands before it */
const EXEMPT: Record<string, { file: string; text: string; why: string }> = {
  discardOp: { file: "src/features/StuckOps.tsx", text: "sync.stuck.sure", why: "«Отменить изменение…» → a second step says what happens → «Да, отменить»" },
  dropUnsentIn: { file: "src/features/ClosedCompany.tsx", text: "fr9.closed.dropSure", why: "the unsent changes of a closed company: a second step before dropping" },
  cancelPurchaseOrder: { file: "src/app/purchase-order/[id].tsx", text: "po.cancelAsk", why: "a sheet asks «Отменить заказ?» before the cancel" },
};

describe("rule 5: destructive store mutations return undo or stand behind a confirmation", () => {
  const members = storeMembers(read("src/data/store.tsx"));
  it("the parser reads the Store type", () => {
    expect(Object.keys(members).length).toBeGreaterThan(100);
    expect(members.removePhoto).toMatch(/Undo/);
  });
  it("every destructive member returns Undo/GuardedUndo or is exempt", () => {
    const bad = Object.entries(members)
      .filter(([name]) => DESTRUCTIVE.test(name))
      .filter(([name, ret]) => !/Undo/.test(ret) && !EXEMPT[name])
      .map(([name, ret]) => `${name}: ${ret}`);
    expect(bad, `destructive store members without undo (return Undo, or add a confirmation and list it in EXEMPT):\n${bad.join("\n")}`).toEqual([]);
  });
  it("an exemption points at a confirmation that is still there", () => {
    for (const [name, e] of Object.entries(EXEMPT)) {
      expect(name in members, `${name} is not in the Store type any more — delete it from EXEMPT`).toBe(true);
      expect(read(e.file), `${name}: ${e.file} lost «${e.text}» (${e.why})`).toContain(e.text);
    }
  });
  it("the detector flags a destructive member without undo", () => {
    const fake = storeMembers("interface StoreCtx {\n  removeThing: (id: string) => void;\n  removeOther: (id: string) => Undo;\n}\n");
    expect(Object.entries(fake).filter(([n, r]) => DESTRUCTIVE.test(n) && !/Undo/.test(r)).map(([n]) => n)).toEqual(["removeThing"]);
  });
});
