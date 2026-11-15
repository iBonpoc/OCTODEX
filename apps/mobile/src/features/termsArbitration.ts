/**
 * #1325 (PRD 05 EST-US-31, docs/legal/legal-research.md: «Арбитраж»): a contractor's own Terms that speak of arbitration
 * need, in a California home-improvement contract, a special notice with the client's initials (B&P §7191). Before 1.0
 * only a warning to the contractor when the Terms are saved (the estimate's and the company's defaults); the required
 * block itself — after 1.0. The text is the contractor's, in any of the client languages: en / es / ru.
 */

// the word in its forms: arbitration, arbitrate, arbitrator, arbitral; arbitraje, arbitral, árbitro; арбитраж, арбитр,
// третейский (суд) — accents and case do not matter
const ARBITRATION = /\b(arbitra(?:t|l|j)\w*|arbitro\w*)|арбитр\p{L}*|третейск\p{L}*/iu;

/** does a Terms text speak of arbitration? (the warning «согласуйте с юристом» is shown, nothing is blocked) */
export function mentionsArbitration(text: string | undefined | null): boolean {
  if (!text) return false;
  // the text as typed (Cyrillic «й» keeps its mark) and without the accents (Spanish «árbitro»)
  return ARBITRATION.test(text) || ARBITRATION.test(text.normalize("NFD").replace(/\p{M}/gu, ""));
}
