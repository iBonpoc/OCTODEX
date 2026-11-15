/**
 * РС-6: the sections the client reads — the engine (countedSections) and the phone (clientDoc of the normalized document)
 * on the same examples as the server's app.client_sections (T199, test/fixtures/clientSections.json).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countedSections } from "@octo/estimating-engine";
import { clientDoc, cloneOption, newDoc, normalizeDoc } from "../src/features/estimateDoc";
import type { EstimateDoc } from "../src/data/types";

type Case = { name: string; sections: unknown[]; client: { id: string }[] };
const fx = JSON.parse(readFileSync(new URL("./fixtures/clientSections.json", import.meta.url), "utf8")) as { cases: Case[] };

describe("unit:clientSections — the phone = the server (T199)", () => {
  for (const c of fx.cases) {
    it(c.name, () => {
      // the engine counts the same sections, in the same order, as the server passes them to the client
      expect(countedSections({ sections: c.sections as never }).map((x) => x.id)).toEqual(c.client.map((x) => x.id));
      // and the phone's own page / PDF shows the same (clientDoc of the document as it is read: normalizeDoc)
      const d: EstimateDoc = newDoc();
      d.options[0] = { ...d.options[0]!, sections: c.sections as never };
      expect(clientDoc(normalizeDoc(d).doc).options[0]!.sections).toEqual(c.client);
    });
  }
  it("sections that are not a list: the client gets none; «Добавить вариант» does not fail (review of #1218)", () => {
    const d: EstimateDoc = newDoc();
    d.options[0] = { ...d.options[0]!, sections: { a: 1 } as never };
    expect("sections" in clientDoc(d).options[0]! && clientDoc(d).options[0]!.sections !== undefined).toBe(false);
    expect(JSON.parse(JSON.stringify(clientDoc(d))).options[0].sections).toBeUndefined();
    expect(() => cloneOption(d.options[0]!, "Better")).not.toThrow();
    expect(cloneOption(d.options[0]!, "Better").sections).toBeUndefined();
    d.options[0] = { ...d.options[0]!, sections: [null, { id: "s1" }] as never };
    expect(cloneOption(d.options[0]!, "Better").sections).toEqual([{ id: expect.any(String) }]);
  });
  it("«false» written as a string at $0 is hidden, as the server reads it; a sectionId longer than 64 is no link", () => {
    const d: EstimateDoc = newDoc();
    d.options[0] = { ...d.options[0]!, lines: [
      { id: "a", name: "Kit", group: "material", quantity: "1", unit: "ea", unitPriceCents: 0, clientVisible: "false" as never },
      { id: "b", name: "Work", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000, sectionId: "y".repeat(65) },
      { id: "c", name: "Work 2", group: "labor", quantity: "1", unit: "ea", unitPriceCents: 1000, sectionId: "s1" },
    ] };
    const lines = clientDoc(normalizeDoc(d).doc).options[0]!.lines;
    expect(lines.map((l) => [l.id, l.sectionId])).toEqual([["b", undefined], ["c", "s1"]]);
  });
});
