import { describe, expect, it } from "vitest";
import { cleanEmail, cleanPhone, mailtoHref, smsHref, telHref } from "../src/features/contactLinks";

describe("contact links (security check of П2: a lead address from a web form goes into a link)", () => {
  it("an address with ?cc= / &body= gives no link at all", () => {
    expect(mailtoHref("a@b.com?cc=x@evil.com")).toBeNull();
    expect(mailtoHref("a@b.com&body=pay%20here")).toBeNull();
    expect(mailtoHref("a@b.com\nbcc:x@evil.com")).toBeNull();
    expect(mailtoHref("a@b.com,x@evil.com")).toBeNull();
    expect(mailtoHref("a@b.com#x")).toBeNull();
    expect(mailtoHref("not an email")).toBeNull();
    expect(mailtoHref(undefined)).toBeNull();
    expect(mailtoHref("")).toBeNull();
  });
  it("a plain address: one recipient, @ kept, subject and body encoded", () => {
    expect(mailtoHref("  ann.lee+roof@mail.com ")).toBe("mailto:ann.lee%2Broof@mail.com");
    expect(mailtoHref("o'brien@mail.com")).toBe("mailto:o'brien@mail.com");
    const u = mailtoHref("ann@mail.com", { subject: "Roof & Co", body: "Hi?\nTomorrow 9:00 & ok" })!;
    expect(u).toBe("mailto:ann@mail.com?subject=Roof%20%26%20Co&body=Hi%3F%0ATomorrow%209%3A00%20%26%20ok");
    expect(u.split("?")).toHaveLength(2);
    expect(u.match(/&/g)).toHaveLength(1);
  });
  it("phones: only digits and one leading +", () => {
    expect(cleanPhone("(818) 555-0101")).toBe("8185550101");
    expect(cleanPhone("+1 818 555 0101")).toBe("+18185550101");
    expect(cleanPhone("818+555?body=x")).toBe("818555");
    expect(cleanPhone("call me")).toBe("");
    expect(telHref("(818) 555-0101")).toBe("tel:8185550101");
    expect(telHref("—")).toBeNull();
  });
  it("sms: the body separator follows the platform; the text is encoded", () => {
    expect(smsHref("(818) 555-0101")).toBe("sms:8185550101");
    expect(smsHref("8185550101", "See you & bye", "ios")).toBe("sms:8185550101&body=See%20you%20%26%20bye");
    expect(smsHref("8185550101", "See you", "android")).toBe("sms:8185550101?body=See%20you");
    expect(smsHref("8185550101?body=hacked", "real", "android")).toBe("sms:8185550101?body=real");
    expect(smsHref(null, "x")).toBeNull();
  });
  it("cleanEmail keeps a normal address and drops the rest", () => {
    expect(cleanEmail("Ann@Mail.com")).toBe("Ann@Mail.com");
    expect(cleanEmail("a@@b.com")).toBe("");
    expect(cleanEmail("a b@c.com")).toBe("");
  });
});
