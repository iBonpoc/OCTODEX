/**
 * Developer's language on a contractor's screen (audit T-03…T-07, #884): these texts say what it is and what to do — no engine,
 * core, secret, Supabase, no «did not match» of a server document. The words are checked in ru, en and es.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tFor } from "../src/i18n/translate";

/** `"key": "value",` lines of a dictionary file */
const parseDict = (src: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/^\s*("(?:[^"\\]|\\.)+")\s*:\s*("(?:[^"\\]|\\.)*")\s*,?\s*$/gm)) out[JSON.parse(m[1]!)] = JSON.parse(m[2]!);
  return out;
};

const KEYS = (k: string) => k === "rpt.help" || k === "co.tradesNote" || k === "intake.set.readyHint.noSecret" || k.startsWith("sync.stuck.");
const SERVER = /сервер|\bserver|servidor/i;
const FORBIDDEN = /движок|двигател|engine|\bmotor\b|\bядр|\bcore\b|\bnúcleo|секрет|\bsecret|\bsecreto|supabase|INTAKE_|calc_inputs|не совпали|did not match|no coinciden/i;

describe("no developer's language in the contractor's texts (#884)", () => {
  for (const lang of ["ru", "en", "es"] as const) {
    const dict = parseDict(readFileSync(join(__dirname, "..", "src", "i18n", `${lang}.ts`), "utf8"));
    it(`${lang}: rpt.help, co.tradesNote, intake noSecret, sync.stuck.*`, () => {
      const bad = Object.entries(dict).filter(([k, v]) => KEYS(k) && FORBIDDEN.test(v)).map(([k, v]) => `${k}: ${v}`);
      expect(bad).toEqual([]);
      expect(Object.keys(dict).filter(KEYS).length).toBeGreaterThan(20);
    });
    // glossary 13.3: no «сервер» on the card of a change that waits — what happened and what to do (#884; «Причина на сервере, не в телефоне»)
    it(`${lang}: sync.stuck.* do not speak of the server`, () => {
      const bad = Object.entries(dict).filter(([k, v]) => k.startsWith("sync.stuck.") && SERVER.test(v)).map(([k, v]) => `${k}: ${v}`);
      expect(bad).toEqual([]);
    });
  }
});

/** «Client», not «Customer» in the English interface (founder 11.11, #889); the legal pages keep the legal word */
const CUSTOMER_OK = (k: string) => k.startsWith("legal.");
describe("EN says Client, not Customer (#889)", () => {
  const en = parseDict(readFileSync(join(__dirname, "..", "src", "i18n", "en.ts"), "utf8"));
  it("no «customer» in EN values outside the legal pages", () => {
    expect(Object.entries(en).filter(([k, v]) => !CUSTOMER_OK(k) && /\bcustomers?\b/i.test(v)).map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });
  it("the client's PDF in English reads «Client» (tFor, the document language)", () => {
    expect(tFor("en")("est.pdf.customer")).toBe("Client");
    expect(tFor("en")("visit.signHere")).toBe("Client signs here");
  });
});
