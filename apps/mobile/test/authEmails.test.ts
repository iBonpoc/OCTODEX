/**
 * #1756 — the sign-in emails carry the code (CODE_LENGTH digits) and no link. A new address gets «confirmation», a known one
 * «magic_link» (signInWithOtp): if either has no {{ .Token }} the screen asks for a code the email does not have, and a
 * link signs in on the website instead of the app. The hosted project takes the same texts by hand.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CODE_LENGTH } from "@/features/signIn";

const root = join(__dirname, "../../..");
const config = readFileSync(join(root, "supabase/config.toml"), "utf8");

describe("auth emails", () => {
  for (const kind of ["magic_link", "confirmation"]) {
    it(`${kind}: the code, no link`, () => {
      const block = new RegExp(`\\[auth\\.email\\.template\\.${kind}\\]\\s*\\nsubject = "([^"]*)"\\s*\\ncontent_path = "\\./supabase/([^"]+)"`).exec(config);
      expect(block, `[auth.email.template.${kind}] in config.toml`).toBeTruthy();
      const [, subject, file] = block!;
      expect(subject).toContain("{{ .Token }}");
      expect(subject).toMatch(/GoRix/);
      const html = readFileSync(join(root, "supabase", file), "utf8").replace(/<!--[\s\S]*?-->/g, "");
      expect(html).toContain("{{ .Token }}");
      expect(html).not.toMatch(/ConfirmationURL|TokenHash|RedirectTo|SiteURL|href=/);
      expect(html).not.toMatch(/OCTODEX|Supabase/i);
      // copied by hand into the hosted project: nothing of ours in it, nothing a stranger could have set (spec 52 §8)
      expect(html).not.toMatch(/<!--|\{\{ *\.Data/);
      expect(html).toContain("Never share this code");
      // the words say the real life of the code (otp_expiry, docs/specs/52 Р3)
      const expiry = Number(/\notp_expiry = (\d+)/.exec(config)?.[1]);
      expect(expiry).toBe(600);
      expect(html).toContain(`expires in ${expiry / 60} minutes`);
    });
  }
  it("the app's code length is the server's (otp_length, spec 52 Р3)", () => {
    expect(Number(/\notp_length = (\d+)/.exec(config)?.[1])).toBe(CODE_LENGTH);
  });
  it("confirmations stay on (accept_invitation trusts email_confirmed_at; the code confirms the address)", () => {
    expect(config).toMatch(/\[auth\.email\]\s*\nenable_confirmations = true/);
  });
});
