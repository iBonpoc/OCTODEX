/**
 * Support contact — the ONE place for it (7а-1; App Store 1.5, docs/specs/14-app-store.md §1 п.3).
 * PLACEHOLDER until the founder gives the real address (docs/specs/19 §5.5 q.1): `.example` is a reserved domain,
 * nothing is delivered there. Replace SUPPORT_EMAIL and set SUPPORT_PLACEHOLDER = false.
 */
export const SUPPORT_EMAIL = "support@gorix.example";
export const SUPPORT_PLACEHOLDER = true;

/** mailto: with a subject and a body (encoded); «Сообщить о проблеме» puts the app version and the platform in */
export function mailto(to: string, subject: string, body = ""): string {
  const q = [`subject=${encodeURIComponent(subject)}`, body ? `body=${encodeURIComponent(body)}` : ""].filter(Boolean).join("&");
  return `mailto:${to}?${q}`;
}
