/**
 * #2996 (founder 27.11): the client's «Замер» opened a NEW ESTIMATE. The header icon must be the measuring module's
 * measurement, never «/estimate/new»; no measuring module switched on — no icon (nothing pretends to measure).
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ Platform: { OS: "web" }, Linking: {}, Share: {} }));
vi.mock("expo-print", () => ({}));
vi.mock("expo-sharing", () => ({}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("@/cloud/client", () => ({ supabase: {} }));
vi.mock("../src/cloud/client", () => ({ supabase: {} }));
vi.mock("@/config/backend", () => ({ WEB_APP_URL: "https://example.test" }));
import { readFileSync } from "node:fs";
import { makeSeed } from "../src/data/seed";
import { registerModule } from "../src/modules/registry";
import gutters from "../src/modules/gutters/module";
import { clientMeasureHref, clientPlaceCtx } from "../src/features/client/clientMeasure";

registerModule(gutters);
const NOW = Date.parse("2026-11-27T20:00:00Z");

describe("the client's «Замер» (#2996)", () => {
  const seed = makeSeed();
  const c = seed.customers[0]!;
  const props = seed.properties.filter((p) => p.customerId === c.id);
  const ctx = clientPlaceCtx(seed, c.id, [], props);

  it("with Gutters on — the module's measurement, never a new estimate", () => {
    const db = { ...seed, company: { ...seed.company!, modules: { gutters: { enabled: true, settings: {}, rowVersion: 1, unlimited: true } } } };
    const href = clientMeasureHref(db, "director", ctx, NOW);
    expect(href).toMatch(/^\/module\/gutters\//);
    expect(href).not.toMatch(/estimate\/new/);
    if (props.length === 1) expect(href).toContain(encodeURIComponent(props[0]!.id));
  });

  it("no measuring module — no «Замер» at all", () => {
    const db = { ...seed, company: { ...seed.company!, modules: {} } };
    expect(clientMeasureHref(db, "director", ctx, NOW)).toBeUndefined();
  });

  it("the card's icon goes where the helper says, not to the estimate item of «＋»", () => {
    const src = readFileSync(new URL("../src/features/client/ClientCard.tsx", import.meta.url), "utf8");
    const line = src.split("\n").find((l) => l.includes('testID: "client-measure"')) ?? "";
    expect(line).toContain("measureHref");
    expect(src).not.toMatch(/estimateHref as Href\), testID: "client-measure"/);
  });
});
