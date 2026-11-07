/**
 * docs/specs/32: every modal turns with the phone. React Native shows a Modal on an iPhone in portrait only unless it
 * lists the orientations — a sheet opened in landscape would turn the whole screen to portrait. The web run can't see
 * that (no rotation in a browser), so this guard reads the sources: every <Modal …> passes supportedOrientations.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : [];
  });

/** each <Modal …> opening tag: from "<Modal" to its own ">" — braces counted, so "=>" or ">" inside {…} props don't end it */
function modalTags(src: string): string[] {
  const tags: string[] = [];
  for (const m of src.matchAll(/<Modal\b/g)) {
    let depth = 0;
    let quote = "";
    for (let i = m.index! + 6; i < src.length; i++) {
      const ch = src[i]!;
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'" || ch === "`") quote = ch;
      else if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) {
        tags.push(src.slice(m.index!, i + 1));
        break;
      }
    }
  }
  return tags;
}

describe("modals turn with the phone (docs/specs/32)", () => {
  it("ALL_ORIENTATIONS: portrait, upside down (an iPad in a stand) and landscape", () => {
    const def = readFileSync(join(SRC, "ui", "overlays.tsx"), "utf8").match(/export const ALL_ORIENTATIONS[^=]*= (\[[^\]]*\])/)?.[1] ?? "";
    expect(def).toContain('"portrait"');
    expect(def).toContain('"landscape"');
    expect(def).toContain('"portrait-upside-down"');
  });
  it("every <Modal> in the app passes supportedOrientations", () => {
    const missing: string[] = [];
    let seen = 0;
    for (const f of files(SRC)) {
      for (const tag of modalTags(readFileSync(f, "utf8"))) {
        seen++;
        if (!/supportedOrientations=/.test(tag)) missing.push(`${relative(SRC, f)}: ${tag.slice(0, 80)}`);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(4); // Menu, Sheet, the drawer, the signature
    expect(missing).toEqual([]);
  });
  it("the tag reader is not fooled by an arrow or a \">\" inside the props", () => {
    const src = '<Modal visible onRequestClose={() => a > b && close()} statusBarTranslucent>\n<View />';
    expect(modalTags(src)).toEqual(['<Modal visible onRequestClose={() => a > b && close()} statusBarTranslucent>']);
  });
});
