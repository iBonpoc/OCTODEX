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

/** each <Modal …> opening tag: from "<Modal" to the ">" that ends a line (not the "=>" of an arrow in its props) */
const modalTags = (src: string) => [...src.matchAll(/<Modal\b[\s\S]*?(?<!=)>\s*$/gm)].map((m) => m[0]);

describe("modals turn with the phone (docs/specs/32)", () => {
  it("ALL_ORIENTATIONS: both portrait and landscape", () => {
    const def = readFileSync(join(SRC, "ui", "overlays.tsx"), "utf8").match(/export const ALL_ORIENTATIONS[^=]*= (\[[^\]]*\])/)?.[1] ?? "";
    expect(def).toContain('"portrait"');
    expect(def).toContain('"landscape"');
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
});
