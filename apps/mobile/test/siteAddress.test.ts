/**
 * The site's address in one piece (#656 слой 2): the app builds its links (/p/, /f/, invites, sign-in) on WEB_APP_URL,
 * Stripe's onboarding comes back to APP_URL — both must be a site the functions accept, or a client's payment, a request
 * form or a sign-in breaks. The old name octodex was released when the subdomain changed: it is refused everywhere.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_APP_URL } from "../src/config/backend";
import { ALLOWED_ORIGINS } from "../../../supabase/functions/stripe-pay/handler";
import { SITE_ORIGIN } from "../../../supabase/functions/lead-intake/handler";

const connect = readFileSync(join(__dirname, "../../../supabase/functions/stripe-connect/index.ts"), "utf8");

describe("unit:siteAddress — the app's links lead to a site the functions accept (#656)", () => {
  it("the site is gorix.expo.app", () => {
    expect(WEB_APP_URL).toBe("https://gorix.expo.app");
  });
  it("payments and request forms accept the site the app links to", () => {
    expect(ALLOWED_ORIGINS).toContain(WEB_APP_URL);
    expect(SITE_ORIGIN.test(WEB_APP_URL)).toBe(true);
  });
  it("Stripe's onboarding comes back to the same site", () => {
    expect(/const APP_URL = "([^"]+)"/.exec(connect)?.[1]).toBe(WEB_APP_URL);
  });
  it("the released old name octodex is refused everywhere: anyone may take it now (#656)", () => {
    expect(ALLOWED_ORIGINS).not.toContain("https://octodex.expo.app");
    for (const o of ["https://octodex.expo.app", "https://octodex--pr-1.expo.app"]) expect(SITE_ORIGIN.test(o), o).toBe(false);
    expect(connect).not.toMatch(/octodex\.expo\.app/);
  });
});
