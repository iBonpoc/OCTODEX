/**
 * #3017 (founder 27.11: «я знаю его по адресу»): the address of a list's row — the street and the town, without the state and the ZIP
 * («4512 Ventura Canyon Ave, Sherman Oaks», not «…, Sherman Oaks, CA 91423»): on 390 the whole street fits; no street — the town alone;
 * nothing — no line (never «—»). One rule for clients and leads (crm-review 27.11).
 */
export function shortAddress(street?: string | null, city?: string | null): string | undefined {
  const town = (city ?? "").replace(/,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?\s*$/, "").replace(/,?\s*\b[A-Z]{2}\s*$/, "").trim();
  const s = (street ?? "").replace(/,?\s*[A-Z]{2}\s*\d{5}(-\d{4})?\s*$/, "").trim();
  const out = [s, town && !s.toLowerCase().includes(town.toLowerCase()) ? town : ""].filter(Boolean).join(", ");
  return out || undefined;
}
