/**
 * Required fields (DS §11 п.3–4): the registry in features/requiredFields.ts is true to the code.
 * - a `done` form uses useRequiredForm, binds every listed field, and has no disabled main button;
 * - every registered file exists.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REQUIRED_FORMS } from "../src/features/requiredFields";

const APP = join(__dirname, "..", "src", "app");

describe("required fields registry", () => {
  it("every registered screen exists", () => {
    for (const f of REQUIRED_FORMS) expect(existsSync(join(APP, f.file)), f.file).toBe(true);
  });
  for (const f of REQUIRED_FORMS.filter((x) => x.status === "done")) {
    it(`${f.route}: submits through useRequiredForm, no disabled main button`, () => {
      const src = readFileSync(join(APP, f.file), "utf8");
      expect(src).toMatch(/useRequiredForm\(\)/);
      expect(src).toMatch(/form\.submit\(/);
      for (const id of f.fields) expect(src, `${f.route}: field "${id}"`).toMatch(new RegExp(`field\\(\\s*"${id}"\\s*\\)|id: "${id}"`));
      expect(src, `${f.route}: the main button stays enabled`).not.toMatch(/disabled=\{!ok\}/);
    });
  }
});
