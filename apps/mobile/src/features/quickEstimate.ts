import {
  buildGbbOptions,
  computeDeposit,
  computeOption,
  type GutterInput,
  type Line,
  type OptionTotals,
  type PriceBook,
} from "@octo/estimating-engine";

/** Quick-form inputs (what the founder measures on paper today). */
export interface QuickGutterForm {
  stories: number;
  lengthFt: number;
  downspouts: number;
  outsideCorners: number;
  insideCorners: number;
  tearOff: boolean;
  tileRoof: boolean;
}

export const DEFAULT_FORM: QuickGutterForm = {
  stories: 1,
  lengthFt: 120,
  downspouts: 4,
  outsideCorners: 2,
  insideCorners: 0,
  tearOff: true,
  tileRoof: false,
};

export function formToInput(f: QuickGutterForm): GutterInput {
  return {
    runs: [
      {
        id: "R1",
        story: f.stories,
        profile: "K6",
        gauge: ".032",
        color: "White",
        segmentsFt: [Math.max(0, f.lengthFt)],
        tearOff: f.tearOff,
        hangerType: f.tileRoof ? "strap_tile" : "hidden",
      },
    ],
    miters: [
      ...Array.from({ length: f.outsideCorners }, () => ({ runId: "R1", kind: "out" as const })),
      ...Array.from({ length: f.insideCorners }, () => ({ runId: "R1", kind: "in" as const })),
    ],
    downspouts: Array.from({ length: f.downspouts }, () => ({ runId: "R1", size: "3x4" as const })),
  };
}

export interface QuickOption {
  name: string;
  lines: Line[];
  totals: OptionTotals;
  deposit: number;
  depositCapped: boolean;
}

/** CA contractor: tax is included in the price (docs/03-prd/19-taxes.md). Deposit 10%, CA cap min(10%, $1,000). */
export function quickOptions(f: QuickGutterForm, book: PriceBook): QuickOption[] {
  if (f.lengthFt <= 0) return [];
  return buildGbbOptions(formToInput(f), book).map(({ preset, lines }) => {
    const totals = computeOption(lines, { mode: "included_in_price", enabled: false, rateBps: 0 });
    const dep = computeDeposit(totals.total, { kind: "pct", value: "0.1", contractType: "ca_hic" });
    return { name: preset.name, lines, totals, deposit: dep.deposit, depositCapped: dep.warnings.length > 0 };
  });
}
