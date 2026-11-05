/**
 * Links for «Позвонить / SMS / Письмо». Every number and address here comes from people outside the company (a web
 * form, a marketplace lead), so nothing is put into a link raw: a lead address like
 * "a@b.com?cc=x@evil.com&body=…" must not add a copy or change the letter (security check of П2).
 * Pure functions: the platform is a parameter (tests run without react-native).
 */
export type LinkOs = "ios" | "android" | "web" | string;

/** only digits and a leading +; "" when no digit is left */
export function cleanPhone(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/[^\d+]/g, "");
  const p = d.startsWith("+") ? "+" + d.slice(1).replace(/\+/g, "") : d.replace(/\+/g, "");
  return /\d/.test(p) ? p : "";
}

/** a plain address: one @, no spaces and no link characters; "" otherwise */
export function cleanEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  return /^[^\s@?&#%/\\:<>",;]+@[^\s@?&#%/\\:<>",;]+\.[^\s@?&#%/\\:<>",;]+$/.test(e) ? e : "";
}

export function telHref(phone: string | null | undefined): string | null {
  const p = cleanPhone(phone);
  return p ? `tel:${p}` : null;
}

/** iOS takes "&body=", the others "?body=" */
export function smsHref(phone: string | null | undefined, body?: string, os: LinkOs = "web"): string | null {
  const p = cleanPhone(phone);
  if (!p) return null;
  return body ? `sms:${p}${os === "ios" ? "&" : "?"}body=${encodeURIComponent(body)}` : `sms:${p}`;
}

export function mailtoHref(email: string | null | undefined, opts: { subject?: string; body?: string } = {}): string | null {
  const e = cleanEmail(email);
  if (!e) return null;
  const q = [
    opts.subject ? `subject=${encodeURIComponent(opts.subject)}` : "",
    opts.body ? `body=${encodeURIComponent(opts.body)}` : "",
  ].filter(Boolean);
  return `mailto:${encodeURIComponent(e).replace(/%40/g, "@")}${q.length ? `?${q.join("&")}` : ""}`;
}
