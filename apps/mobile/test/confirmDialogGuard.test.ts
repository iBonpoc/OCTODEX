/** #2381 (ревью 1 Ж2, spec §11 п.4): the confirmation dialog is a component of src/ui, in the showcase and in DS Б3; the estimate
 *  editor asks with it (useConfirm), not with a sheet; its save never says «Сохранено» where the store refused */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

describe("design system: ConfirmDialog (DS Б3, #2381)", () => {
  it("is in src/ui, in the showcase «Окна» and marked done in DS §8.1", () => {
    expect(read("src", "ui", "confirmDialog.tsx")).toMatch(/export function ConfirmDialog/);
    expect(read("src", "features", "showcase", "registry.ts")).toMatch(/components: \["Sheet", "SheetScroll", "HelpButton", "ConfirmDialog"\]/);
    expect(read("src", "features", "showcase", "Windows.tsx")).toMatch(/useConfirm\(\)/);
    expect(read("..", "..", "design", "naryad-ds", "DESIGN-SYSTEM.md")).toMatch(/\| `ConfirmDialog` \+ `useConfirm` \| диалог подтверждения \| да \| ✅/);
  });
  it("the scrim does not close it; Esc / «Назад» is the way back", () => {
    const src = read("src", "ui", "confirmDialog.tsx");
    expect(src).toMatch(/onRequestClose=\{\(\) => \(Platform\.OS !== "web" \|\| escDown\.current \? onPick\(back \? back\.key : null\) : undefined\)\}/);
    // #2774: the web's Esc closes it only from a press that went down while it was up (not the keyup of the Esc that asked)
    expect(src).toMatch(/if \(e\.key === "Escape"\) escDown\.current = true;/);
    expect(src).not.toMatch(/<Pressable[^>]*onPress/);
  });
  it("the estimate editor asks with useConfirm; a refused save keeps the edits and says so", () => {
    const src = read("src", "app", "estimate", "new.tsx");
    expect(src).toMatch(/const \[dialog, ask\] = useConfirm\(\)/);
    expect(src).toMatch(/if \(undo === NO_UNDO\) \{[\s\S]{0,200}k1\.refused/);
  });
});
