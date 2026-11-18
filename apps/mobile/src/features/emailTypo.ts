/**
 * «Может, gmail.com?» before the code goes (spec 52 §6): a mistyped domain of a big mailbox is caught on the device —
 * a code to «gmial.com» never arrives and the person waits for nothing. A short list, no network, no guessing beyond it.
 */
const FIX: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.con": "gmail.com",
  "gnail.com": "gmail.com",
  "gamil.com": "gmail.com",
  "yahooo.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outlook.co": "outlook.com",
  "icloud.co": "icloud.com",
  "iclod.com": "icloud.com",
  "icoud.com": "icloud.com",
};

/** the fixed address when the domain is a known typo, else null */
export function emailTypoFix(email: string): string | null {
  const e = email.trim();
  const at = e.lastIndexOf("@");
  if (at < 1) return null;
  const domain = e.slice(at + 1).toLowerCase();
  const fix = FIX[domain];
  return fix ? `${e.slice(0, at)}@${fix}` : null;
}
