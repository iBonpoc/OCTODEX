/**
 * Own fields (wave П-2b, docs/specs/13-app-structure.md §3.10): does a value fit its field? The same rule as the server
 * (supabase app.tg_custom_value_guard), so the phone refuses offline what the server would refuse later.
 */
import type { CustomField, CustomFieldValueData } from "./types";

const isDay = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const UUID = /^[0-9a-f-]{36}$/;

export function customValueOk(f: Pick<CustomField, "type" | "options">, v: CustomFieldValueData): boolean {
  switch (f.type) {
    case "text":
      return typeof v === "string" && v.length <= 500;
    case "long_text":
      return typeof v === "string" && v.length <= 10000;
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "checkbox":
      return typeof v === "boolean";
    case "date":
      return typeof v === "string" && isDay(v);
    case "select":
      return typeof v === "string" && f.options.includes(v);
    case "multiselect":
      return Array.isArray(v) && v.every((x) => typeof x === "string" && f.options.includes(x));
    case "file":
      return typeof v === "string" && UUID.test(v);
    default:
      return false;
  }
}
