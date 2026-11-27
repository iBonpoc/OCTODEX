/**
 * #3024 (founder 26.11: «Налоги и гатерсы, чтобы у него были»; «в ней gutters и отдельно… ремонт розетки»): the module's part of
 * the demo's test client (ModuleDef.demo) — one measurement «Front + right side» (two runs 40′ + 30′ by tape, a corner, two
 * downspouts) and its lines in the client's open estimate, in their own section next to the core's ordinary lines.
 * The lines carry the module's mark (`source`) as «Смета» of this measurement writes them: the quantities are the module's for
 * this drawing (the parts of GUTTER_PARTS_VERSION with the company's default rules). Prices are PLACEHOLDERS (rule 9).
 * Demo only: the cloud never gets this.
 */
import { GUTTER_PARTS_VERSION } from "@octo/estimating-engine";
import type { DB, EstimateDoc } from "@/data/types";
import { summarize } from "@/features/estimateDoc";
import type { DemoClient } from "../registry";
import { KEY } from "./data";
import type { LineSource } from "./estimate";

export const DEMO_MEASUREMENT_ID = "gm-tc-1";
const SECTION = "s-demo-gutters";
type Ln = EstimateDoc["options"][number]["lines"][number];

function lines(at: string): Ln[] {
  const W = "color=white|gauge=.027|material=aluminum";
  let n = 0;
  const G = (group: "material" | "labor", name: string, quantity: string, unit: string, priceCents: number, key: string, section: string): Ln => {
    const source: LineSource = { module: KEY, key, section, qty: quantity, priceCents, name, unit, testPrice: true, measurementId: DEMO_MEASUREMENT_ID, at, engineVersion: GUTTER_PARTS_VERSION };
    return { id: `l-demo-g${++n}`, group, name, quantity, unit, unitPriceCents: priceCents, sectionId: SECTION, source };
  };
  return [
    G("material", "5″ K-style gutter, aluminum .027, white", "70", "ft", 950, `ft|${W}|part=gutter|profile=k|size=5`, "gutter"),
    G("material", "End cap, 5″ K-style, white", "2", "ea", 800, `ea|${W}|part=end_cap|profile=k|size=5`, "corners_caps"),
    G("material", "Downspout strap 2×3", "4", "ea", 300, "ea|metal=aluminum|part=ds_strap|shape=rect|size=2x3", "fasteners"),
    G("material", "Hidden hanger, 5″ K-style", "37", "ea", 250, "ea|hanger=hidden|metal=aluminum|part=hanger|profile=k|size=5", "fasteners"),
    G("material", "Downspout 2×3, aluminum, white", "20", "ft", 700, "ft|color=white|material=aluminum|part=downspout|shape=rect|size=2x3", "downspouts"),
    G("material", "Outlet 2×3 for 5″ gutter, white", "2", "ea", 1200, `ea|${W}|gutterSize=5|part=outlet|profile=k|shape=rect|size=2x3`, "adapters"),
    G("material", "Gutter sealant", "1", "ea", 900, "ea|part=sealant", "consumables"),
    G("labor", "Corner cut (miter)", "1", "ea", 2500, "ea|work=corner_cut", "labor"),
    G("labor", "Downspout install, 1st story", "2", "ea", 4500, "ea|story=1|work=downspout", "labor"),
    G("labor", "Gutter install, 1st story", "70", "ft", 600, "ft|story=1|work=install", "labor"),
  ];
}

/** the demo seed with the module's part for the test client */
export function guttersDemo(db: DB, c: DemoClient): DB {
  const RUN = { profile: "k", size: "5", material: "aluminum", gauge: ".027", color: "white", story: 1, mount: "fascia", hanger: "hidden" };
  const DS = { shape: "rect", size: "2x3", material: "aluminum", color: "white", bottom: { kind: "none" } };
  const M = DEMO_MEASUREMENT_ID;
  const data = {
    measurements: [{ id: M, label: "Front + right side", status: "ready", propertyId: c.propertyId, leadId: c.leadId, accuracy: "tape", updatedAt: c.at }],
    elements: [
      { id: "ge-demo-r1", measurementId: M, kind: "run", geom: { a: [0, 0], b: [480, 0], lengthIn: 480 }, attrs: { ...RUN }, confidence: "taped" },
      { id: "ge-demo-r2", measurementId: M, kind: "run", geom: { a: [480, 0], b: [480, 360], lengthIn: 360 }, attrs: { ...RUN }, confidence: "taped" },
      { id: "ge-demo-d1", measurementId: M, kind: "downspout", geom: { runId: "ge-demo-r1", atIn: 24 }, attrs: { ...DS }, confidence: "drawn" },
      { id: "ge-demo-d2", measurementId: M, kind: "downspout", geom: { runId: "ge-demo-r2", atIn: 336 }, attrs: { ...DS }, confidence: "drawn" },
    ],
  };
  const estimates = db.estimates.map((e) => {
    if (e.id !== c.estimateId || !e.doc) return e;
    const doc: EstimateDoc = {
      ...e.doc,
      note: `Seamless gutters on the front and the right side, two downspouts. ${e.doc.note ?? ""}`.trim(),
      options: e.doc.options.map((o, i) =>
        i === 0
          ? {
              ...o,
              sections: [{ id: SECTION, title: "Gutters" }, ...(o.sections ?? [])],
              lines: [
                ...lines(c.at),
                ...o.lines,
                { id: "l-demo-guards", group: "service", name: "Gutter guards (add-on)", quantity: "70", unit: "ft", unitPriceCents: 450, optional: true, sectionId: SECTION },
              ],
            }
          : o,
      ),
    };
    return { ...e, title: `Gutters + ${e.title.toLowerCase()}`, doc, ...summarize(doc) };
  });
  return { ...db, estimates, moduleData: { ...db.moduleData, [KEY]: data } };
}
