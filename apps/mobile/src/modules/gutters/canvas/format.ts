/** A length in whole inches as a contractor in the US writes it: 12′ 6″, 8′, 9″ (rule 7: US formats). */
export function ftIn(inches: number): string {
  const n = Math.max(0, Math.round(inches));
  const ft = Math.floor(n / 12);
  const i = n % 12;
  if (ft === 0) return `${i}″`;
  return i === 0 ? `${ft}′` : `${ft}′ ${i}″`;
}
