import type { PriceBook } from "../src/gutterEstimate.js";
import type { GutterInput } from "../src/gutters.js";

/** Test price book (placeholder prices, PRD 04 «тестовые»). Costs match PRD 06 example A. */
const M = (priceCents: number, costCents: number, name: string, materialCents?: number) => ({
  name, priceCents, costCents, materialCents, purchaseTaxBps: materialCents ? 1025 : undefined, placeholder: true,
});

export const BOOK: PriceBook = {
  "gut.K6..032": M(1200, 290, "Seamless gutter 6″ K-style .032"),
  "gut.K5..027": M(1000, 250, "Seamless gutter 5″ K-style .027"),
  "fee.story2": M(300, 0, "2nd story surcharge"),
  "fee.story3": M(600, 0, "3rd story surcharge"),
  "fee.story4": M(900, 0, "4th story surcharge"),
  "ds.3x4": M(1100, 180, "Downspout 3×4"),
  "ds.2x3": M(900, 160, "Downspout 2×3"),
  "miter.out": M(2500, 600, "Outside miter", 250),
  "miter.in": M(2500, 600, "Inside miter", 250),
  "elbow.a.3x4": M(600, 140, "A-elbow 3×4", 140),
  "elbow.b.3x4": M(600, 140, "B-elbow 3×4", 140),
  "elbow.a.2x3": M(600, 140, "A-elbow 2×3", 140),
  "rem.tearoff": M(200, 0, "Tear-off & haul-away"),
  "fee.tile": M(150, 0, "Tile roof strap hangers"),
  "fascia.repair": M(1800, 0, "Fascia repair"),
  "guard.micromesh": M(1400, 0, "Micro-mesh guards, noncombustible"),
  "hanger.hidden": M(0, 85, "Hidden hanger", 85),
  "hanger.strap_tile": M(0, 120, "Strap hanger (tile)", 120),
  "endcap.K6": M(0, 120, "End cap K6", 120),
  "endcap.K5": M(0, 120, "End cap K5", 120),
  "outlet.3x4": M(0, 210, "Outlet 3×4", 210),
  "outlet.2x3": M(0, 210, "Outlet 2×3", 210),
  sealant: M(0, 750, "Sealant tube", 750),
  screws: M(0, 900, "Screw box", 900),
  "coil.15..032": M(0, 140, "Coil 15″ .032 (per LF)", 140),
  "coil.11.875..027": M(0, 120, "Coil 11⅞″ .027 (per LF)", 120),
  "dsstick.3x4": M(0, 1400, "Downspout stick 10′ 3×4", 1400),
  "dsstick.2x3": M(0, 1200, "Downspout stick 10′ 2×3", 1200),
};

/** PRD 06 example A: ranch, 1 story, K6 .032 3×4 Musket Brown. */
export const EXAMPLE_A: GutterInput = {
  runs: [
    { id: "R1", story: 1, profile: "K6", gauge: ".032", color: "Musket Brown", segmentsFt: [60] },
    { id: "R2", story: 1, profile: "K6", gauge: ".032", color: "Musket Brown", segmentsFt: [50, 30] },
  ],
  miters: [{ runId: "R2", kind: "out" }],
  downspouts: [
    { runId: "R1", size: "3x4" }, { runId: "R1", size: "3x4" },
    { runId: "R2", size: "3x4" }, { runId: "R2", size: "3x4" },
  ],
};

/** PRD 06 example B: 2 stories, tile, tear-off, fire zone. */
export const EXAMPLE_B: GutterInput = {
  runs: [
    { id: "R1", story: 2, profile: "K6", gauge: ".032", color: "Musket Brown", segmentsFt: [30, "45.5", 30], tearOff: true, hangerType: "strap_tile" },
    { id: "R2", story: 1, profile: "K6", gauge: ".032", color: "White", segmentsFt: [24], tearOff: true, hangerType: "strap_tile" },
  ],
  miters: [{ runId: "R1", kind: "out" }, { runId: "R1", kind: "out" }],
  downspouts: [
    { runId: "R1", size: "3x4" }, { runId: "R1", size: "3x4" }, { runId: "R1", size: "3x4" },
    { runId: "R2", size: "3x4" },
  ],
};

/** PRD 06 example C: commercial, story 3 + custom height, extension 1 ft. */
export const EXAMPLE_C: GutterInput = {
  runs: [{ id: "R1", story: 3, profile: "K6", gauge: ".032", color: "White", segmentsFt: [80] }],
  miters: [],
  downspouts: [
    { runId: "R1", size: "3x4" }, { runId: "R1", size: "3x4" },
    { runId: "R1", size: "3x4", heightMode: "custom", customHeightFt: 46 },
  ],
  constants: { dsExtensionFt: 1 },
};
