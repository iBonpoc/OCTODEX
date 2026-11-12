/**
 * Required fields (DS §11 п.3–4, Р10): the registry in features/requiredFields.ts is true to the code.
 * - the registered files exist;
 * - `done`: useRequiredForm + form.submit, every field bound (form.field("id")), its error key used on the screen and
 *   present in the dictionary, `field-<id>-error` looked for in the form's e2e spec, no disabled main button;
 * - `todo`: still has the old pattern (else it is `done`);
 * - ALL of src/app: a screen with the old pattern (a disabled button on the form's validity) or with useRequiredForm
 *   must be in the registry (a new form cannot slip in).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REQUIRED_FORMS, fieldTestID } from "../src/features/requiredFields";
import { afterBlur, afterEdit, errorsOf, firstProblem, scrollTargetY } from "../src/ui/requiredLogic";

const APP = join(__dirname, "..", "src", "app");
const E2E = join(__dirname, "..", "e2e", "specs");
const DICT = readFileSync(join(__dirname, "..", "src", "i18n", "ru.ts"), "utf8");
const files: string[] = [];
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(f)) files.push(p);
  }
};
walk(APP);
/** a button turned off by the form's own validity */
const OLD = /disabled=\{[^}]*(!ok\b|!ready\b|!valid\b|!\w+\.trim\(\)|dateBad|!canImport)/;
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const rel = (f: string) => relative(APP, f).split("\\").join("/");

describe("required fields registry", () => {
  it("every registered screen exists", () => {
    for (const f of REQUIRED_FORMS) expect(existsSync(join(APP, f.file)), f.file).toBe(true);
  });
  it("a screen with the old pattern or with useRequiredForm is registered", () => {
    const listed = new Set(REQUIRED_FORMS.map((f) => f.file));
    const stray = files
      .filter((f) => OLD.test(readFileSync(f, "utf8")) || /useRequiredForm\(\)/.test(readFileSync(f, "utf8")))
      .map(rel)
      .filter((f) => !listed.has(f));
    expect(stray, "add the form to features/requiredFields.ts").toEqual([]);
  });
  for (const f of REQUIRED_FORMS.filter((x) => x.status === "done")) {
    it(`${f.route}: converted — fields, error keys, e2e`, () => {
      const src = read(f.file);
      expect(src).toMatch(/useRequiredForm\(\)/);
      expect(src).toMatch(/form\.submit\(/);
      expect(src, `${f.route}: the main button stays enabled`).not.toMatch(OLD);
      expect(f.fields.length).toBeGreaterThan(0);
      const spec = f.e2e ? readFileSync(join(E2E, f.e2e), "utf8") : "";
      expect(f.e2e, `${f.route}: e2e spec`).toBeTruthy();
      for (const { id, errorKey } of f.fields) {
        expect(src, `${f.route}: field "${id}" bound`).toMatch(new RegExp(`form\\.field\\(\\s*"${id}"`));
        expect(src, `${f.route}: error key ${errorKey} used`).toContain(`"${errorKey}"`);
        expect(DICT, `${errorKey} in the dictionary`).toContain(`"${errorKey}"`);
        expect(spec, `${f.e2e}: looks for ${fieldTestID(id)}`).toContain(`${fieldTestID(id)}`);
      }
    });
  }
  it("an exempt screen says why", () => {
    for (const f of REQUIRED_FORMS.filter((x) => x.status === "exempt")) expect(f.why, f.route).toBeTruthy();
  });
  for (const f of REQUIRED_FORMS.filter((x) => x.status === "todo")) {
    it(`${f.route}: todo is still the old way`, () => {
      const src = read(f.file);
      expect(OLD.test(src) || !/useRequiredForm\(\)/.test(src) , `${f.route}: converted? mark it done`).toBe(true);
      expect(/useRequiredForm\(\)/.test(src), `${f.route}: converted? mark it done`).toBe(false);
    });
  }
});

describe("scrollTargetY", () => {
  it("stops the field below what covers the top (the status bar, the header), then the margin", () => {
    // the field is 400 below the scroll view's top, the scroll is at 100, a notch phone covers 103
    expect(scrollTargetY({ offset: 100, nodeY: 500, viewY: 100, covered: 103, margin: 24 })).toBe(100 + 400 - 103 - 24);
  });
  it("never scrolls above the start", () => {
    expect(scrollTargetY({ offset: 0, nodeY: 120, viewY: 0, covered: 103, margin: 24 })).toBe(0);
  });
  it("a pinned screen covers nothing", () => {
    expect(scrollTargetY({ offset: 0, nodeY: 300, viewY: 0, covered: 0, margin: 24 })).toBe(276);
  });
});

describe("required form logic", () => {
  const ps = [
    { id: "phone", text: "p" },
    { id: "name", text: "n" },
    { id: "source", text: "s" },
  ];
  it("shows the error under ALL wrong fields, the scroll goes to the first in the given order", () => {
    expect(errorsOf(ps)).toEqual({ phone: "p", name: "n", source: "s" });
    expect(firstProblem(ps)?.id).toBe("phone");
    expect(firstProblem([])).toBeUndefined();
  });
  it("editing a field takes its error away, others stay", () => {
    expect(afterEdit(errorsOf(ps), "phone", "5")).toEqual({ name: "n", source: "s" });
  });
  it("a still-wrong value keeps its error (with the check's text) — it does not hide at the first symbol", () => {
    const bad = (v: string) => (v.includes("@") ? undefined : "bad");
    expect(afterEdit({ email: "bad" }, "email", "a", bad)).toEqual({ email: "bad" });
    expect(afterEdit({ email: "bad" }, "email", "a@b", bad)).toEqual({});
  });
  it("no error on the field: editing does not invent one", () => {
    const bad = () => "bad";
    expect(afterEdit({}, "email", "a", bad)).toEqual({});
  });
  it("leaving a filled wrong field shows the error; an empty one waits for the button", () => {
    const bad = (v: string) => (v.includes("@") ? undefined : "bad");
    expect(afterBlur({}, "email", "abc", bad)).toEqual({ email: "bad" });
    expect(afterBlur({}, "email", "  ", bad)).toEqual({});
    expect(afterBlur({ email: "bad" }, "email", "a@b", bad)).toEqual({});
  });
});
