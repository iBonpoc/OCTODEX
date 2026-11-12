/**
 * РС-6: the sections the client reads — the engine (countedSections; the phone's clientDoc counts with it) on the same
 * examples as the server's app.client_sections (T199, test/fixtures/clientSections.json).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countedSections } from "@octo/estimating-engine";

type Case = { name: string; sections: unknown[]; client: { id: string }[] };
const fx = JSON.parse(readFileSync(new URL("./fixtures/clientSections.json", import.meta.url), "utf8")) as { cases: Case[] };

describe("unit:clientSections — the phone = the server (T199)", () => {
  for (const c of fx.cases) {
    it(c.name, () => {
      // the engine counts the same sections, in the same order, as the server passes them to the client
      expect(countedSections({ sections: c.sections as never }).map((x) => x.id)).toEqual(c.client.map((x) => x.id));
    });
  }
});
