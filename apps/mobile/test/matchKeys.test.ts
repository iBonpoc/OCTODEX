/**
 * One rule for a duplicate on the phone and on the server (docs/specs/04 §14.5 №10): the same examples
 * (test/fixtures/matchKeys.json) are checked here against the app's keys and in db T139 against app.phone_key /
 * app.email_key / app.address_key and public.import_customers. A change of a rule changes the file — both sides go red.
 */
import { describe, expect, it } from "vitest";
import { fullPhoneKey } from "../src/data/people";
import { addressKey, emailKey } from "../src/features/clientDuplicates";
import fx from "./fixtures/matchKeys.json";

const orNull = (k: string) => k || null;

describe("match keys = the server's (T139)", () => {
  it.each(fx.phones)("phone $in", (x) => expect(orNull(fullPhoneKey(x.in))).toBe(x.key));
  it.each(fx.emails)("email $in", (x) => expect(orNull(emailKey(x.in))).toBe(x.key));
  it.each(fx.addresses)("address $street, $city", (x) => {
    // a property row (zip given, even empty) has place; an import row has only the city text
    const p = x.zip !== null ? { address: x.street, unit: x.unit ?? undefined, city: x.city, place: { city: x.city, zip: x.zip } } : { address: x.street, unit: x.unit ?? undefined, city: x.city };
    expect(orNull(addressKey(p))).toBe(x.key);
  });
});
