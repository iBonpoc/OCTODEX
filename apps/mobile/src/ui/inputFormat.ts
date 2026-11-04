/** Formatting while typing (US): phone, EIN, ZIP, card. Pure functions (unit-tested). */
const digits = (s: string, max: number) => s.replace(/\D/g, "").slice(0, max);

/** (555) 555-0100; a leading +1 / 1 is dropped; partial input stays readable */
export function formatPhoneUS(s: string): string {
  let d = s.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
/** 12-3456789 */
export function formatEIN(s: string): string {
  const d = digits(s, 9);
  return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d;
}
/** 91103 or 91103-1234 */
export function formatZip(s: string): string {
  const d = digits(s, 9);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
/** 4242 4242 4242 4242 */
export function formatCard(s: string): string {
  return digits(s, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}
/** MM/YY */
export function formatCardExp(s: string): string {
  const d = digits(s, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}
/** two-letter state code */
export const formatState = (s: string) => s.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 2);
/** MM/DD/YYYY */
export function formatDateUS(s: string): string {
  const d = digits(s, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}
