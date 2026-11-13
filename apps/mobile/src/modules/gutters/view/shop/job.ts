/** What the shop drawings print beside the measurement (#1349): the company, the job, the company's rules, the words. */
import type { PartQty } from "@octo/estimating-engine";
import type { DictKey } from "@/i18n";
import { fmtLen, type LenFormat } from "../../canvas/format";
import { fi } from "./model";

export type Tr = (key: DictKey, params?: Record<string, string | number>) => string;

/** the title block's fields; one that is not known stays a blank to fill by hand (or «—»), never a made-up value */
export interface ShopJob {
  company: { name: string; lines: string[] };
  project?: string;
  client?: string;
  address?: string;
  drawnBy?: string;
  checked?: string;
  /** the document's date, US format */
  date: string;
  rev?: string;
  projectNo?: string;
}

/** the company's rules a quantity's basis is worded from (Settings → Gutters); the quantities are the engine's */
export interface ShopRules {
  hangerSpacingIn: number;
  hangerExtra: boolean;
  wastePct: number;
  dsStickFt: number;
  storyFt: number;
  /** how a corner is made when the drawing does not say */
  corner: "cut" | "strip" | "prefab";
}

export interface ShopCtx {
  /** the document's translator */
  t: Tr;
  job: ShopJob;
  rules: ShopRules;
  /** the estimate's materials, as the engine counted them */
  parts: readonly PartQty[];
  fmt: LenFormat;
}

/** a word of the shop drawings' dictionary */
export const sw = (t: Tr, k: string, p?: Record<string, string | number>) => t(`mod.gutters.shop.${k}` as DictKey, p);
/** the same, as a drawing letters it */
export const SW = (t: Tr, k: string, p?: Record<string, string | number>) => sw(t, k, p).toLocaleUpperCase();
/** a value's word where the dictionary has one (a profile, a material, a colour), else the value as the company typed it */
export const attrWord = (t: Tr, group: "p" | "m" | "c" | "sh", v: string) => {
  const k = `mod.gutters.attr.${group}.${v}` as DictKey;
  const w = t(k);
  return w === k ? v : w;
};
/** a length on the sheet: feet-inches as a drawing writes them (44'-6"), or the company's metric format */
export const lenText = (inches: number, fmt: LenFormat) => (fmt === "ftin" ? fi(inches) : fmtLen(inches, fmt));
/** 2x3 → 2"×3" */
export const dsSizeText = (s: string) => s.split(/x/i).map((p) => `${p}"`).join("×");

/** the title block's company lines and the job's fields, from what the app knows; the rest stays blank on the sheet */
export function shopJob(company: { name: string; address?: string; phone?: string; licenses?: { kind: string; number: string }[] }, x: { client?: string; address?: string; date: string }): ShopJob {
  const lines = [company.address, company.phone, ...(company.licenses ?? []).map((l) => `${l.kind} #${l.number}`.trim())].filter((v): v is string => !!v);
  return { company: { name: company.name, lines }, ...(x.client ? { client: x.client } : {}), ...(x.address ? { address: x.address } : {}), date: x.date };
}
