/**
 * «Замеры» (founder 09.11, версия 475: «из замера вышел — замеры никуда не сохраняются, черновиков нет»; spec 33
 * П20.22): every measurement of the company the phone has, the drafts without a client too, newest first — each with
 * whom it is for (a lead / an address / nobody yet) and what is drawn. Pure.
 */
import type { DB } from "@/data/types";
import { fromElements } from "./canvas/model";
import { gutterData } from "./data";
import { runLengthIn } from "./geometry";

export interface MeasurementItem {
  id: string;
  status: "draft" | "ready";
  /** the lead's name, else the property's address, else null — a draft for nobody yet */
  forName: string | null;
  address: string | null;
  leadId: string | null;
  runs: number;
  downspouts: number;
  /** total gutter length, inches */
  lengthIn: number;
  updatedAt: string | null;
}

export function measurementList(db: Pick<DB, "moduleData" | "leads" | "properties">): MeasurementItem[] {
  const g = gutterData(db);
  return g.measurements
    .map((m) => {
      const d = fromElements(g.elements.filter((e) => e.measurementId === m.id));
      const lead = m.leadId ? db.leads.find((l) => l.id === m.leadId) : undefined;
      const prop = m.propertyId ? db.properties.find((p) => p.id === m.propertyId) : undefined;
      const address = prop ? [prop.address, prop.city].filter(Boolean).join(", ") : null;
      return {
        id: m.id,
        status: m.status,
        forName: lead?.name ?? address,
        address,
        leadId: m.leadId,
        runs: d.runs.length,
        downspouts: d.downspouts.length,
        lengthIn: d.runs.reduce((n, r) => n + runLengthIn(r), 0),
        updatedAt: m.updatedAt ?? null,
      };
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}
