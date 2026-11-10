/** I18nOverride (rule 7): inside, the client's language; outside, the app's — untouched. */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "ru" }] }));
vi.mock("@/data/persist", () => ({ usePersistentState: () => ["ru", () => {}, true] }));

import { overrideI18n, type I18nCtx } from "../src/i18n";
import { translate } from "../src/i18n/translate";
import { setZone } from "../src/features/zone";

const setLang = vi.fn();
const app: I18nCtx = {
  lang: "ru",
  setLang,
  t: (k, p) => translate("ru", k, p),
  money: (c) => `$${c / 100}`,
  moneyWhole: (c) => `$${Math.round(c / 100)}`,
  time: () => "10:00 AM",
  day: () => "чт, 5 нояб.",
  dayOf: () => "чт, 5 нояб.",
};

describe("overrideI18n", () => {
  it.each(["en", "es", "ru"] as const)("inside: t and lang are the client's (%s)", (lang) => {
    const c = overrideI18n(app, lang);
    expect(c.lang).toBe(lang);
    expect(c.t("portal.pdf")).toBe(translate(lang, "portal.pdf"));
    expect(c.t("ue.approvedBy", { name: "Rosa", date: "x" })).toBe(translate(lang, "ue.approvedBy", { name: "Rosa", date: "x" }));
  });
  it("inside: dates are US numeric in every language; money stays the app's US format", () => {
    for (const lang of ["en", "es", "ru"] as const) {
      const c = overrideI18n(app, lang);
      expect(c.day("2026-11-05T17:00:00Z")).toBe("11/05/2026");
      expect(c.money(12345)).toBe(app.money(12345));
    }
  });
  // #605: a calendar day (invoices.due_date, estimates.valid_until) is that day as it is, in every client language and
  // whatever the phone's zone — `new Date("2026-11-05")` is UTC midnight, Nov 4 in Los Angeles (as docDay, dayLabel)
  describe("inside: a calendar day stays that day (#605)", () => {
    const machine = process.env.TZ;
    afterAll(() => { setZone(null); if (machine === undefined) delete process.env.TZ; else process.env.TZ = machine; });
    for (const phone of ["UTC", "Pacific/Honolulu", "Asia/Tokyo", "America/New_York", "America/Los_Angeles"]) {
      it(`phone in ${phone}`, () => {
        process.env.TZ = phone;
        for (const company of ["America/Los_Angeles", "America/New_York", "Pacific/Honolulu"]) {
          setZone(company);
          for (const lang of ["en", "es", "ru"] as const) {
            const c = overrideI18n(app, lang);
            expect(c.day("2026-11-05")).toBe("11/05/2026");
            expect(c.day("2026-01-01")).toBe("01/01/2026");
            expect(c.dayOf("2026-11-05")).toBe("11/05/2026");
          }
        }
        // a moment is the company's day: 7:30 AM UTC Nov 6 is still Nov 5 in Los Angeles, Nov 6 in New York
        setZone("America/Los_Angeles");
        expect(overrideI18n(app, "es").day("2026-11-06T07:30:00Z")).toBe("11/05/2026");
        setZone("America/New_York");
        expect(overrideI18n(app, "ru").day("2026-11-06T07:30:00Z")).toBe("11/06/2026");
      });
    }
  });
  it("inside: setLang does nothing (the client page cannot switch the app language)", () => {
    overrideI18n(app, "en").setLang("es");
    expect(setLang).not.toHaveBeenCalled();
  });
  it("outside: the app context is untouched", () => {
    const before = { ...app };
    overrideI18n(app, "en");
    expect(app).toEqual(before);
    expect(app.t("portal.pdf")).toBe(translate("ru", "portal.pdf"));
    expect(app.lang).toBe("ru");
  });
});
